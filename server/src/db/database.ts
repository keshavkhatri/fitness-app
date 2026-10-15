import { Client, ClientConfig, Pool, PoolConfig } from 'pg';
import type { Log } from '../extraction-handler';
import { DatabaseConfig } from './database-config';

/** How long a readiness answer is reused, so polling /ready can't turn into database load. */
export const READINESS_CACHE_MS = 10_000;

/**
 * pg connection settings from the parsed config. The fields are passed separately (not as a
 * connection string), so the password is never joined into a string that could be logged, and
 * the TLS policy decided in database-config can't be altered by URL parameters.
 */
export function clientConfig(config: DatabaseConfig): ClientConfig {
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl === false ? false : { rejectUnauthorized: config.ssl.rejectUnauthorized },
    connectionTimeoutMillis: config.connectTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
    query_timeout: config.statementTimeoutMs + 5_000,
    application_name: 'pulseform-api',
    keepAlive: true,
    ...(config.options ? { options: config.options } : {}),
  };
}

export function poolConfig(config: DatabaseConfig): PoolConfig {
  return { ...clientConfig(config), max: config.poolMax, idleTimeoutMillis: config.idleTimeoutMs };
}

/** One connection, for the migration tool (a session-level lock must stay on a single connection). */
export function createClient(config: DatabaseConfig): Client {
  return new Client(clientConfig(config));
}

export interface Database {
  readonly pool: Pool;
  /** Whether the database answers. Never throws and carries no detail: callers expose a boolean at most. */
  checkReadiness(): Promise<boolean>;
  close(): Promise<void>;
}

/**
 * The connection pool for a Cloud Run instance. Nothing connects until the first query, so
 * starting (and scaling to zero and back) never waits on or fails because of the database.
 * Connections are few and short-lived: Neon closes idle ones, and an instance that is not serving
 * a request has its CPU throttled.
 */
export function createDatabase(config: DatabaseConfig, log: Log, now: () => number = Date.now): Database {
  const pool = new Pool(poolConfig(config));
  // Without a listener, an idle connection dropped by the server would crash the process.
  // The SQLSTATE or network error code is safe to log; the message may carry host details.
  pool.on('error', (error: Error & { code?: string }) => log('database.pool-error', { code: error.code ?? 'unknown' }));

  let cached: { readonly at: number; readonly ok: boolean } | null = null;
  let inFlight: Promise<boolean> | null = null;

  async function probe(): Promise<boolean> {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch (error) {
      log('database.unavailable', { code: (error as { code?: string }).code ?? 'unknown' });
      return false;
    }
  }

  return {
    pool,
    async checkReadiness() {
      if (cached && now() - cached.at < READINESS_CACHE_MS) {
        return cached.ok;
      }
      inFlight ??= probe().then((ok) => {
        cached = { at: now(), ok };
        inFlight = null;
        return ok;
      });
      return inFlight;
    },
    close: () => pool.end(),
  };
}
