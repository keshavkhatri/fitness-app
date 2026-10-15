import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '../src/db/database';
import { looksPooled, loadDatabaseConfig } from '../src/db/database-config';
import { MigrationError, migrateUp, migrationStatus } from '../src/db/migrations';
import { loadMigrations } from './migration-files';
import { ConfigError, text } from '../src/env';

/**
 * The explicit migration step:  node migrate.mjs [up | status] [--allow-pooled]
 *
 * Reads MIGRATION_DATABASE_URL (preferred: Neon's DIRECT, non-pooled connection) or DATABASE_URL.
 * Prints migration names, counts and codes only: never the connection string, host or password.
 * Exit codes: 0 done, 1 failed, 2 bad usage.
 */
async function main(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  const args = argv.filter((a) => !a.startsWith('--'));
  const command = args[0] ?? 'up';
  if (command !== 'up' && command !== 'status') {
    console.error('Usage: migrate [up|status] [--allow-pooled]');
    return 2;
  }

  const variable = text(env, 'MIGRATION_DATABASE_URL') ? 'MIGRATION_DATABASE_URL' : 'DATABASE_URL';
  const config = loadDatabaseConfig(env, variable);
  if (!config) {
    console.error('Set MIGRATION_DATABASE_URL (or DATABASE_URL) to a PostgreSQL connection string. See server/DATABASE.md.');
    return 1;
  }
  if (looksPooled(config) && !argv.includes('--allow-pooled')) {
    console.error(
      'This is a pooled connection (the host contains "-pooler"). Migrations need the direct connection: session locks and transactions are not reliable through a pooler. Use the direct string as MIGRATION_DATABASE_URL, or pass --allow-pooled if you are sure.',
    );
    return 1;
  }

  const files = await loadMigrations(migrationsDirectory(env));
  const client = createClient(config);
  await client.connect();
  try {
    if (command === 'status') {
      const status = await migrationStatus(client, files);
      for (const m of status.applied) {
        console.log(`applied  ${String(m.version).padStart(4, '0')}_${m.name}`);
      }
      for (const m of status.pending) {
        console.log(`pending  ${String(m.version).padStart(4, '0')}_${m.name}`);
      }
      console.log(status.pending.length === 0 ? 'Database is up to date.' : `${status.pending.length} migration(s) pending.`);
      return 0;
    }
    const applied = await migrateUp(client, files, console.log);
    console.log(applied.length === 0 ? 'Database is up to date.' : `Applied ${applied.length} migration(s).`);
    return 0;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** `migrations/` next to the bundle (the container image), else `../migrations` (a local build in server/dist). */
function migrationsDirectory(env: NodeJS.ProcessEnv): string {
  const override = text(env, 'MIGRATIONS_DIR');
  if (override) {
    return override;
  }
  const beside = fileURLToPath(new URL('./migrations', import.meta.url));
  return existsSync(beside) ? beside : fileURLToPath(new URL('../migrations', import.meta.url));
}

main(process.argv.slice(2), process.env).then(
  (code) => process.exit(code),
  (error: unknown) => {
    if (error instanceof ConfigError || error instanceof MigrationError) {
      console.error(error.message);
    } else {
      // A connection or query failure: the code identifies it; the message could include host details.
      const code = (error as { code?: string }).code;
      console.error(`Could not reach or query the database${code ? ` (${code})` : ''}. Check the connection string, that the database is reachable, and that TLS is enabled.`);
    }
    process.exit(1);
  },
);
