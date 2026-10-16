import { PGlite } from '@electric-sql/pglite';
import { fileURLToPath } from 'node:url';
import type { SqlClient } from '../src/db/migrations';

/**
 * Tests run against PGlite, a real PostgreSQL engine in WebAssembly, inside the test process:
 * no server, no credentials, no network. It is not Neon: nothing here proves a Neon connection.
 */
export const MIGRATIONS_DIRECTORY = fileURLToPath(new URL('../migrations', import.meta.url));

export async function newDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.waitReady;
  return db;
}

/** The migrator's client over PGlite: a script (no values) runs through exec so it may hold several statements. */
export function sqlClient(db: PGlite): SqlClient {
  return {
    async query(text, values) {
      if (values && values.length > 0) {
        return { rows: (await db.query<Record<string, unknown>>(text, [...values])).rows };
      }
      const results = await db.exec(text);
      return { rows: (results.at(-1)?.rows ?? []) as Record<string, unknown>[] };
    },
  };
}

/** The message of the error a statement raises, or null if it succeeds. */
export async function failure(db: PGlite, sql: string, values: unknown[] = []): Promise<string | null> {
  try {
    await db.query(sql, values);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

/**
 * A pg-Pool-shaped wrapper over PGlite, so Kysely's PostgresDialect (and Better Auth through it) runs
 * its real queries on the in-process engine. One connection: fine for sequential tests.
 */
export function pglitePool(db: PGlite) {
  const command = (sql: string) => (/^\s*(\w+)/.exec(sql)?.[1] ?? '').toUpperCase();
  return {
    async connect() {
      return {
        async query(sql: string, params?: unknown[]) {
          const result = await db.query<Record<string, unknown>>(sql, params ?? []);
          return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length, command: command(sql) };
        },
        release() {},
      };
    },
    async end() {},
  };
}
