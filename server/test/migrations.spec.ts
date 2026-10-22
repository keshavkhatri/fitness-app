import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MigrationError,
  checksumOf,
  migrateUp,
  migrationStatus,
  parseMigrationFileName,
  pendingMigrations,
  validateMigrations,
  type MigrationFile,
} from '../src/db/migrations';
import { loadMigrations } from '../tools/migration-files';
import { MIGRATIONS_DIRECTORY, failure, newDatabase, sqlClient } from './pglite';

const file = (version: number, name: string, sql = 'SELECT 1'): MigrationFile => ({ version, name, sql, checksum: checksumOf(sql) });

describe('migration files', () => {
  it('parses NNNN_name.sql and rejects anything else', () => {
    expect(parseMigrationFileName('0001_schemas.sql')).toEqual({ version: 1, name: 'schemas' });
    expect(parseMigrationFileName('0042_add_index_2.sql')).toEqual({ version: 42, name: 'add_index_2' });
    for (const bad of ['1_x.sql', '0001-x.sql', '0001_X.sql', '0001_.sql', '0001_x.txt', 'x.sql']) {
      expect(parseMigrationFileName(bad)).toBeNull();
    }
  });

  it('orders by version and requires 1, 2, 3 with no gaps or duplicates', () => {
    expect(validateMigrations([file(2, 'b'), file(1, 'a')]).map((m) => m.version)).toEqual([1, 2]);
    expect(() => validateMigrations([file(1, 'a'), file(3, 'c')])).toThrow(/without gaps: expected 2 but found 3/);
    expect(() => validateMigrations([file(2, 'b')])).toThrow(/expected 1 but found 2/);
    expect(() => validateMigrations([file(1, 'a'), file(1, 'b')])).toThrow(/Two migration files have version 1/);
    expect(() => validateMigrations([file(1, 'a', '  \n')])).toThrow(/is empty/);
  });

  it('hashes the file the same whatever its line endings (Git on Windows rewrites them)', () => {
    expect(checksumOf('CREATE TABLE a (\r\n  id int\r\n);\r\n')).toBe(checksumOf('CREATE TABLE a (\n  id int\n);\n'));
    expect(checksumOf('SELECT 1')).not.toBe(checksumOf('SELECT 2'));
  });

  describe('on disk', () => {
    let directory: string | null = null;
    afterEach(async () => {
      if (directory) {
        await rm(directory, { recursive: true, force: true });
        directory = null;
      }
    });
    const folder = async (files: Record<string, string>) => {
      directory = await mkdtemp(join(tmpdir(), 'migrations-'));
      for (const [name, sql] of Object.entries(files)) {
        await writeFile(join(directory, name), sql);
      }
      return directory;
    };

    it('loads the files in order and ignores other files', async () => {
      const dir = await folder({ '0002_b.sql': 'SELECT 2', '0001_a.sql': 'SELECT 1', 'README.md': 'notes' });
      expect((await loadMigrations(dir)).map((m) => `${m.version}:${m.name}`)).toEqual(['1:a', '2:b']);
    });

    it('rejects a misnamed .sql file and a missing directory with a clear message', async () => {
      await expect(loadMigrations(await folder({ 'add_things.sql': 'SELECT 1' }))).rejects.toThrow(/must be named NNNN_name\.sql/);
      await expect(loadMigrations(join(tmpdir(), 'definitely-not-here-xyz'))).rejects.toThrow(MigrationError);
    });

    it("loads the repository's own migrations: contiguous, named, non-empty", async () => {
      const files = await loadMigrations(MIGRATIONS_DIRECTORY);
      expect(files.length).toBeGreaterThanOrEqual(5);
      expect(files.map((m) => m.version)).toEqual(files.map((_, i) => i + 1));
    });
  });
});

describe('planning', () => {
  const files = [file(1, 'a'), file(2, 'b'), file(3, 'c')];

  it('runs everything on a fresh database and only the rest afterwards', () => {
    expect(pendingMigrations(files, []).map((m) => m.version)).toEqual([1, 2, 3]);
    expect(pendingMigrations(files, files.slice(0, 2)).map((m) => m.version)).toEqual([3]);
    expect(pendingMigrations(files, files)).toEqual([]);
  });

  it('refuses an applied migration whose file was edited, renamed or removed', () => {
    expect(() => pendingMigrations([file(1, 'a', 'SELECT 99')], [file(1, 'a')])).toThrow(/edited after it was applied/);
    expect(() => pendingMigrations([file(1, 'renamed')], [file(1, 'a')])).toThrow(/applied as "a" but the file is now "renamed"/);
    expect(() => pendingMigrations([file(1, 'a')], [file(1, 'a'), file(2, 'b')])).toThrow(/ahead of this checkout/);
  });
});

describe('running migrations (PGlite, real PostgreSQL semantics)', () => {
  it("applies the repository's migrations in order and records each one", async () => {
    const db = await newDatabase();
    const client = sqlClient(db);
    const files = await loadMigrations(MIGRATIONS_DIRECTORY);
    const messages: string[] = [];

    const applied = await migrateUp(client, files, (m) => messages.push(m));
    expect(applied).toEqual(files.map((m) => `${String(m.version).padStart(4, '0')}_${m.name}`));
    expect(messages).toEqual(applied.map((label) => `Applied ${label}`));

    const history = (await db.query<{ version: number; name: string; checksum: string }>('SELECT version, name, checksum FROM stokeform.schema_migrations ORDER BY version')).rows;
    expect(history.map((h) => h.version)).toEqual(files.map((m) => m.version));
    expect(history.map((h) => h.checksum)).toEqual(files.map((m) => m.checksum));

    const status = await migrationStatus(client, files);
    expect(status.pending).toEqual([]);
    expect(status.applied).toHaveLength(files.length);
    // Every migration on a fresh PGlite: slower than the default 5 s on a busy machine.
  }, 30_000);

  it('is repeatable: a second run applies nothing and changes nothing', async () => {
    const db = await newDatabase();
    const client = sqlClient(db);
    const files = await loadMigrations(MIGRATIONS_DIRECTORY);
    await migrateUp(client, files);
    const before = (await db.query('SELECT version, applied_at FROM stokeform.schema_migrations ORDER BY version')).rows;
    expect(await migrateUp(client, files)).toEqual([]);
    expect((await db.query('SELECT version, applied_at FROM stokeform.schema_migrations ORDER BY version')).rows).toEqual(before);
  });

  it('applies only new migrations when more files arrive later', async () => {
    const db = await newDatabase();
    const client = sqlClient(db);
    const first = [file(1, 'one', 'CREATE TABLE stokeform_probe_one (id int)')];
    await migrateUp(client, first);
    const both = [...first, file(2, 'two', 'CREATE TABLE stokeform_probe_two (id int)')];
    expect(await migrateUp(client, both)).toEqual(['0002_two']);
  });

  it('rolls a failing migration back completely and stops, leaving earlier ones applied', async () => {
    const db = await newDatabase();
    const client = sqlClient(db);
    const files = [
      file(1, 'good', 'CREATE TABLE probe_good (id int)'),
      file(2, 'bad', 'CREATE TABLE probe_half (id int); CREATE TABLE probe_half (id int);'),
      file(3, 'never', 'CREATE TABLE probe_never (id int)'),
    ];
    await expect(migrateUp(client, files)).rejects.toThrow(/Migration 0002_bad failed \(42P07\) and was rolled back/);

    expect((await db.query('SELECT version FROM stokeform.schema_migrations ORDER BY version')).rows).toEqual([{ version: 1 }]);
    // Nothing from the failed script survived, and the next one never ran.
    expect(await failure(db, 'SELECT 1 FROM probe_half')).toMatch(/does not exist/);
    expect(await failure(db, 'SELECT 1 FROM probe_never')).toMatch(/does not exist/);
    expect(await failure(db, 'SELECT 1 FROM probe_good')).toBeNull();
  });

  it('can be retried after the failure is fixed', async () => {
    const db = await newDatabase();
    const client = sqlClient(db);
    await expect(migrateUp(client, [file(1, 'bad', 'SELECT nope FROM nowhere')])).rejects.toThrow(MigrationError);
    expect(await migrateUp(client, [file(1, 'bad', 'SELECT 1')])).toEqual(['0001_bad']);
  });

  it('refuses to run when an applied migration was edited, or the database is ahead', async () => {
    const db = await newDatabase();
    const client = sqlClient(db);
    await migrateUp(client, [file(1, 'a', 'CREATE TABLE probe_a (id int)'), file(2, 'b', 'CREATE TABLE probe_b (id int)')]);
    await expect(migrateUp(client, [file(1, 'a', 'CREATE TABLE probe_a (id bigint)'), file(2, 'b', 'CREATE TABLE probe_b (id int)')])).rejects.toThrow(/edited after it was applied/);
    await expect(migrateUp(client, [file(1, 'a', 'CREATE TABLE probe_a (id int)')])).rejects.toThrow(/ahead of this checkout/);
    // The refusals changed nothing.
    expect((await db.query('SELECT count(*)::int AS n FROM stokeform.schema_migrations')).rows).toEqual([{ n: 2 }]);
  });

  it('status is read-only: on a fresh database it creates nothing', async () => {
    const db = await newDatabase();
    const files = [file(1, 'a'), file(2, 'b')];
    const status = await migrationStatus(sqlClient(db), files);
    expect(status.applied).toEqual([]);
    expect(status.pending.map((m) => m.version)).toEqual([1, 2]);
    expect((await db.query("SELECT to_regclass('stokeform.schema_migrations') AS t")).rows).toEqual([{ t: null }]);
  });

  it('releases its lock when it fails, so the next run is not blocked', async () => {
    const db = await newDatabase();
    const client = sqlClient(db);
    await expect(migrateUp(client, [file(1, 'bad', 'SELECT nope FROM nowhere')])).rejects.toThrow();
    const locks = (await db.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory'")).rows;
    expect(locks).toEqual([{ n: 0 }]);
  });
});
