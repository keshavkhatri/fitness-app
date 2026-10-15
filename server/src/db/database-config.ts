import { ConfigError, Env, integer, text } from '../env';

/**
 * Connection settings for PostgreSQL (Neon), read from DATABASE_URL.
 *
 * The URL carries the password, so it is parsed once here into separate fields and is never
 * kept, logged or put in an error message: every error names the variable only.
 *
 * TLS is required for every host except loopback (a local Postgres for development), and a
 * remote server's certificate is always verified (Neon's are publicly trusted). The URL's
 * `sslmode` is therefore only validated, never used to weaken that: `disable`, `allow` and
 * `prefer` are refused for remote hosts. `channel_binding` is accepted and ignored.
 */
export interface DatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database: string;
  /** false only for loopback hosts without a TLS request. */
  readonly ssl: false | { readonly rejectUnauthorized: boolean };
  /** Extra server options from the URL's `options` parameter (e.g. `-c search_path=auth`), if any. */
  readonly options: string | null;
  /** Connections kept per instance. Small: a Cloud Run instance serves few concurrent requests. */
  readonly poolMax: number;
  /** Idle connections are closed after this long (Neon's pooler and Cloud Run both drop idle ones). */
  readonly idleTimeoutMs: number;
  readonly connectTimeoutMs: number;
  /** Server-side limit for one statement. */
  readonly statementTimeoutMs: number;
}

const SSL_MODES = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'] as const;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const isLoopback = (host: string): boolean => LOOPBACK_HOSTS.has(host.toLowerCase());

/** `null` when the variable is unset. `variable` is DATABASE_URL, or MIGRATION_DATABASE_URL for migrations. */
export function loadDatabaseConfig(env: Env, variable = 'DATABASE_URL'): DatabaseConfig | null {
  const raw = text(env, variable);
  if (raw === null) {
    return null;
  }
  const invalid = (reason: string) => new ConfigError(`${variable} ${reason}`);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid('must be a PostgreSQL connection string (postgresql://user:password@host/database).');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw invalid('must start with postgresql:// or postgres://.');
  }
  const host = url.hostname;
  let database: string, user: string, password: string;
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    throw invalid('has a user, password or database name with invalid percent-encoding.');
  }
  if (!host || !database || !user) {
    throw invalid('must include a host, a user and a database name.');
  }

  const sslmode = url.searchParams.get('sslmode');
  if (sslmode !== null && !(SSL_MODES as readonly string[]).includes(sslmode)) {
    throw invalid(`has an unsupported sslmode (use ${SSL_MODES.join(', ')}).`);
  }
  const wantsTls = sslmode === 'require' || sslmode === 'verify-ca' || sslmode === 'verify-full';
  let ssl: DatabaseConfig['ssl'];
  if (isLoopback(host)) {
    ssl = wantsTls ? { rejectUnauthorized: false } : false;
  } else if (sslmode === 'disable' || sslmode === 'allow' || sslmode === 'prefer') {
    throw invalid('must use TLS for a remote database: set sslmode=require (Neon strings include it).');
  } else {
    ssl = { rejectUnauthorized: true };
  }

  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw invalid('has an invalid port.');
  }

  return {
    host,
    port,
    user,
    password,
    database,
    ssl,
    options: url.searchParams.get('options'),
    poolMax: integer(env, 'DATABASE_POOL_MAX', 5, 1, 20),
    idleTimeoutMs: integer(env, 'DATABASE_IDLE_TIMEOUT_MS', 10_000, 1_000, 600_000),
    connectTimeoutMs: integer(env, 'DATABASE_CONNECT_TIMEOUT_MS', 10_000, 1_000, 60_000),
    statementTimeoutMs: integer(env, 'DATABASE_STATEMENT_TIMEOUT_MS', 15_000, 1_000, 600_000),
  };
}

/** Neon's pooled endpoints (PgBouncer) have `-pooler` in the host. Migrations need the direct one. */
export function looksPooled(config: Pick<DatabaseConfig, 'host'>): boolean {
  return /-pooler(\.|$)/i.test(config.host);
}
