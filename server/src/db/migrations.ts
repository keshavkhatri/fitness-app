import { createHash } from 'node:crypto';

/**
 * Versioned SQL migrations, run explicitly (`npm run server:migrate`, or a Cloud Run job with
 * the same image): never by the API server at startup, so a fleet of instances can't race.
 *
 * - Files are `NNNN_name.sql` in `server/migrations`: versions run from 1 with no gaps, in order.
 * - Each migration runs in its own transaction together with its history row: it applies
 *   completely or not at all.
 * - History is in `pulseform.schema_migrations` (version, name, checksum, applied time). An
 *   applied file that was later edited, or a database that is ahead of the files, stops the run:
 *   applied migrations are never rewritten, a new migration fixes forward.
 * - A session-level advisory lock serialises concurrent runs.
 * - Better Auth's tables (schema `auth`) are managed by Better Auth, not here.
 */

/** What a database connection offers the migrator: one statement, or a multi-statement script. */
export interface SqlClient {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: readonly Record<string, unknown>[] }>;
}

export interface MigrationFile {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
  /** SHA-256 of the file with line endings normalised (Git on Windows may rewrite them). */
  readonly checksum: string;
}

export interface AppliedMigration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
}

/** Fails with a message that is safe to print: file names, versions and counts only. */
export class MigrationError extends Error {}

export type MigrationLog = (message: string) => void;

export const FILE_PATTERN = /^(\d{4})_([a-z0-9][a-z0-9_]*)\.sql$/;
const LOCK_KEY = "hashtext('pulseform.schema_migrations')";

export function checksumOf(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

export function parseMigrationFileName(file: string): { version: number; name: string } | null {
  const match = FILE_PATTERN.exec(file);
  return match ? { version: Number(match[1]), name: match[2] } : null;
}

/** Versions must be unique and run 1, 2, 3, … without gaps. Returns them ordered. */
export function validateMigrations(files: readonly MigrationFile[]): MigrationFile[] {
  const ordered = [...files].sort((a, b) => a.version - b.version);
  ordered.forEach((file, index) => {
    if (index > 0 && file.version === ordered[index - 1].version) {
      throw new MigrationError(`Two migration files have version ${file.version}.`);
    }
    if (file.version !== index + 1) {
      throw new MigrationError(`Migration versions must run 1, 2, 3 without gaps: expected ${index + 1} but found ${file.version}.`);
    }
    if (file.sql.trim() === '') {
      throw new MigrationError(`Migration ${label(file)} is empty.`);
    }
  });
  return ordered;
}

const label = (m: { version: number; name: string }) => `${String(m.version).padStart(4, '0')}_${m.name}`;

/** Creates the history table if needed (outside any numbered migration: it must exist to read history). */
async function ensureHistory(client: SqlClient): Promise<void> {
  await client.query(
    `CREATE SCHEMA IF NOT EXISTS pulseform;
     CREATE TABLE IF NOT EXISTS pulseform.schema_migrations (
       version     integer PRIMARY KEY CHECK (version > 0),
       name        text NOT NULL,
       checksum    text NOT NULL,
       applied_at  timestamptz NOT NULL DEFAULT now()
     )`,
  );
}

export async function readApplied(client: SqlClient): Promise<AppliedMigration[]> {
  const { rows } = await client.query('SELECT version, name, checksum FROM pulseform.schema_migrations ORDER BY version');
  return rows.map((row) => ({ version: Number(row['version']), name: String(row['name']), checksum: String(row['checksum']) }));
}

/**
 * Which files still have to run. Throws if history and files disagree: an applied migration whose
 * file changed or is missing, or applied versions that aren't a prefix of the files.
 */
export function pendingMigrations(files: readonly MigrationFile[], applied: readonly AppliedMigration[]): MigrationFile[] {
  applied.forEach((done, index) => {
    const file = files[index];
    if (!file || file.version !== done.version) {
      throw new MigrationError(`The database has migration ${label(done)} applied but no matching file: it is ahead of this checkout or files were removed.`);
    }
    if (file.name !== done.name) {
      throw new MigrationError(`Migration ${done.version} was applied as "${done.name}" but the file is now "${file.name}".`);
    }
    if (file.checksum !== done.checksum) {
      throw new MigrationError(`Migration ${label(file)} was edited after it was applied. Applied migrations are never changed: add a new migration instead.`);
    }
  });
  return files.slice(applied.length);
}

export interface MigrationStatus {
  readonly applied: readonly AppliedMigration[];
  readonly pending: readonly MigrationFile[];
}

/** Read-only: reports history against files (creates nothing, takes no lock). */
export async function migrationStatus(client: SqlClient, files: readonly MigrationFile[]): Promise<MigrationStatus> {
  const exists = await client.query("SELECT to_regclass('pulseform.schema_migrations') AS t");
  const applied = exists.rows[0]?.['t'] ? await readApplied(client) : [];
  return { applied, pending: pendingMigrations(files, applied) };
}

/**
 * Applies every pending migration, oldest first, and returns the labels that were applied.
 * `client` must be a single connection (not a pool): the advisory lock and each transaction
 * belong to that session.
 */
export async function migrateUp(client: SqlClient, files: readonly MigrationFile[], log: MigrationLog = () => undefined): Promise<string[]> {
  await client.query(`SELECT pg_advisory_lock(${LOCK_KEY})`);
  const applied: string[] = [];
  try {
    await ensureHistory(client);
    const pending = pendingMigrations(files, await readApplied(client));
    for (const migration of pending) {
      try {
        await client.query('BEGIN');
        await client.query(migration.sql);
        await client.query('INSERT INTO pulseform.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [
          migration.version,
          migration.name,
          migration.checksum,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        // The SQLSTATE and the database's own message describe the SQL objects, never the connection.
        const code = (error as { code?: string }).code;
        throw new MigrationError(`Migration ${label(migration)} failed${code ? ` (${code})` : ''} and was rolled back: ${firstLine(error)}`);
      }
      log(`Applied ${label(migration)}`);
      applied.push(label(migration));
    }
  } finally {
    await client.query(`SELECT pg_advisory_unlock(${LOCK_KEY})`).catch(() => undefined);
  }
  return applied;
}

const firstLine = (error: unknown): string => (error instanceof Error ? error.message : 'unknown error').split('\n')[0].slice(0, 300);
