import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config';
import { loadDatabaseConfig, looksPooled } from '../src/db/database-config';

// Placeholder credentials only: nothing here is a real host or password.
const PASSWORD = 's3cret-p@ss';
const NEON = `postgresql://app_user:${encodeURIComponent(PASSWORD)}@ep-cool-123.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`;

function errorOf(env: Record<string, string>): string {
  try {
    loadDatabaseConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as Error).message;
  }
  throw new Error('expected a ConfigError');
}

describe('database configuration', () => {
  it('is absent when DATABASE_URL is unset or blank (the server still runs, without a database)', () => {
    expect(loadDatabaseConfig({})).toBeNull();
    expect(loadDatabaseConfig({ DATABASE_URL: '   ' })).toBeNull();
    expect(loadConfig({}).database).toBeNull();
  });

  it('splits a Neon connection string into fields and verifies the server certificate', () => {
    expect(loadDatabaseConfig({ DATABASE_URL: NEON })).toEqual({
      host: 'ep-cool-123.eu-central-1.aws.neon.tech',
      port: 5432,
      user: 'app_user',
      password: PASSWORD, // decoded once here, never kept in a string with the rest
      database: 'neondb',
      ssl: { rejectUnauthorized: true },
      options: null,
      poolMax: 5,
      idleTimeoutMs: 10_000,
      connectTimeoutMs: 10_000,
      statementTimeoutMs: 15_000,
    });
  });

  it('is part of the server configuration', () => {
    expect(loadConfig({ DATABASE_URL: NEON }).database?.database).toBe('neondb');
  });

  it('keeps an explicit port and a server options parameter (for a separate Better Auth schema)', () => {
    const config = loadDatabaseConfig({ DATABASE_URL: 'postgres://u:p@db.example.com:6543/app?sslmode=verify-full&options=-c%20search_path%3Dauth' });
    expect(config).toMatchObject({ port: 6543, options: '-c search_path=auth', ssl: { rejectUnauthorized: true } });
  });

  it('requires TLS for a remote database: a missing sslmode still gets TLS, disabling it is refused', () => {
    expect(loadDatabaseConfig({ DATABASE_URL: 'postgresql://u:p@db.example.com/app' })?.ssl).toEqual({ rejectUnauthorized: true });
    for (const mode of ['disable', 'allow', 'prefer']) {
      expect(errorOf({ DATABASE_URL: `postgresql://u:p@db.example.com/app?sslmode=${mode}` })).toContain('TLS');
    }
  });

  it('lets a loopback database run without TLS for local development', () => {
    expect(loadDatabaseConfig({ DATABASE_URL: 'postgresql://postgres:pw@localhost:5432/dev' })?.ssl).toBe(false);
    expect(loadDatabaseConfig({ DATABASE_URL: 'postgresql://postgres:pw@127.0.0.1/dev?sslmode=disable' })?.ssl).toBe(false);
    expect(loadDatabaseConfig({ DATABASE_URL: 'postgresql://postgres:pw@[::1]/dev' })?.ssl).toBe(false);
    expect(loadDatabaseConfig({ DATABASE_URL: 'postgresql://postgres:pw@localhost/dev?sslmode=require' })?.ssl).toEqual({ rejectUnauthorized: false });
  });

  it.each([
    ['not a URL', 'ep-cool-123 password'],
    ['the wrong scheme', 'mysql://u:p@db.example.com/app'],
    ['no database name', 'postgresql://u:p@db.example.com/'],
    ['no user', 'postgresql://db.example.com/app'],
    ['an unknown sslmode', 'postgresql://u:p@db.example.com/app?sslmode=maybe'],
    ['a bad percent-encoding', 'postgresql://u:%E0%A4%A@db.example.com/app'],
    ['an invalid port', 'postgresql://u:p@db.example.com:99999/app'],
  ])('rejects %s, naming the variable but never the value', (_, url) => {
    const message = errorOf({ DATABASE_URL: url });
    expect(message).toMatch(/^DATABASE_URL /);
    expect(message).not.toContain(url);
  });

  it('never puts the password or host in any error', () => {
    for (const env of [
      { DATABASE_URL: `postgresql://app_user:${PASSWORD}@ep-cool-123.neon.tech/neondb?sslmode=disable` },
      { DATABASE_URL: NEON, DATABASE_POOL_MAX: '999' },
      { DATABASE_URL: NEON.replace('sslmode=require', 'sslmode=bogus') },
    ]) {
      let message = '';
      try {
        loadDatabaseConfig(env);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toBe('');
      expect(message).not.toContain('s3cret');
      expect(message).not.toContain('ep-cool-123');
    }
  });

  it('names MIGRATION_DATABASE_URL when that variable is the bad one', () => {
    expect(() => loadDatabaseConfig({ MIGRATION_DATABASE_URL: 'mysql://x' }, 'MIGRATION_DATABASE_URL')).toThrow(/^MIGRATION_DATABASE_URL /);
  });

  it('reads and bounds the pool settings', () => {
    const config = loadDatabaseConfig({ DATABASE_URL: NEON, DATABASE_POOL_MAX: '2', DATABASE_IDLE_TIMEOUT_MS: '5000', DATABASE_CONNECT_TIMEOUT_MS: '3000', DATABASE_STATEMENT_TIMEOUT_MS: '8000' });
    expect(config).toMatchObject({ poolMax: 2, idleTimeoutMs: 5000, connectTimeoutMs: 3000, statementTimeoutMs: 8000 });
    for (const [name, value] of [['DATABASE_POOL_MAX', '0'], ['DATABASE_POOL_MAX', '21'], ['DATABASE_IDLE_TIMEOUT_MS', '10'], ['DATABASE_STATEMENT_TIMEOUT_MS', 'x']]) {
      expect(() => loadDatabaseConfig({ DATABASE_URL: NEON, [name]: value })).toThrow(new RegExp(`^${name} must be a whole number`));
    }
  });

  it('recognises Neon pooled endpoints, which migrations must not use', () => {
    expect(looksPooled({ host: 'ep-cool-123-pooler.eu-central-1.aws.neon.tech' })).toBe(true);
    expect(looksPooled({ host: 'ep-cool-123.eu-central-1.aws.neon.tech' })).toBe(false);
  });
});
