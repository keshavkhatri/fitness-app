import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDatabaseConfig } from '../src/db/database-config';

// The pool logic only: `pg` is replaced, so no connection is made. This is a mocked test: it says
// nothing about whether a real Neon database is reachable.
const state = vi.hoisted(() => ({ pool: null as unknown as { query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; handlers: Record<string, (e: unknown) => void>; config: Record<string, unknown> } }));
vi.mock('pg', () => {
  class Pool {
    query = vi.fn();
    end = vi.fn(async () => undefined);
    handlers: Record<string, (e: unknown) => void> = {};
    constructor(public config: Record<string, unknown>) {
      state.pool = this;
    }
    on(event: string, handler: (e: unknown) => void) {
      this.handlers[event] = handler;
      return this;
    }
  }
  class Client {
    constructor(public config: Record<string, unknown>) {}
  }
  return { Pool, Client };
});

const { READINESS_CACHE_MS, clientConfig, createClient, createDatabase, poolConfig } = await import('../src/db/database');

const URL_ = 'postgresql://app_user:s3cret-p%40ss@ep-cool-123.eu-central-1.aws.neon.tech/neondb?sslmode=require';
const config = () => loadDatabaseConfig({ DATABASE_URL: URL_ })!;

describe('connection settings', () => {
  it('passes the parts separately, never as a connection string, and always verifies a remote certificate', () => {
    const c = clientConfig(config());
    expect(c).toMatchObject({
      host: 'ep-cool-123.eu-central-1.aws.neon.tech',
      port: 5432,
      user: 'app_user',
      password: 's3cret-p@ss',
      database: 'neondb',
      ssl: { rejectUnauthorized: true },
      application_name: 'pulseform-api',
      keepAlive: true,
    });
    expect(c).not.toHaveProperty('connectionString');
    expect(c).not.toHaveProperty('options');
  });

  it('bounds how long a connection or a statement may take', () => {
    expect(clientConfig(config())).toMatchObject({ connectionTimeoutMillis: 10_000, statement_timeout: 15_000, query_timeout: 20_000 });
  });

  it('sizes the pool small, drops idle connections quickly, and carries server options', () => {
    expect(poolConfig(config())).toMatchObject({ max: 5, idleTimeoutMillis: 10_000 });
    const withOptions = loadDatabaseConfig({ DATABASE_URL: `${URL_}&options=-c%20search_path%3Dauth`, DATABASE_POOL_MAX: '2' })!;
    expect(poolConfig(withOptions)).toMatchObject({ max: 2, options: '-c search_path=auth' });
  });

  it('turns TLS off only for a loopback database', () => {
    const local = loadDatabaseConfig({ DATABASE_URL: 'postgresql://postgres:pw@localhost:5432/dev' })!;
    expect(clientConfig(local).ssl).toBe(false);
  });

  it('gives the migration tool a single connection', () => {
    expect(createClient(config())).toBeDefined();
  });
});

describe('the pool', () => {
  const log = vi.fn();
  let now = 1_000_000;
  const db = () => createDatabase(config(), log, () => now);

  beforeEach(() => {
    log.mockClear();
    now = 1_000_000;
  });

  it('does not connect when created: starting never waits on the database', () => {
    db();
    expect(state.pool.query).not.toHaveBeenCalled();
  });

  it('reports ready when the database answers, and asks only once inside the cache window', async () => {
    const database = db();
    state.pool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    expect(await database.checkReadiness()).toBe(true);
    now += READINESS_CACHE_MS - 1;
    expect(await database.checkReadiness()).toBe(true);
    expect(state.pool.query).toHaveBeenCalledTimes(1);
    expect(state.pool.query).toHaveBeenCalledWith('SELECT 1');
    now += 2;
    expect(await database.checkReadiness()).toBe(true);
    expect(state.pool.query).toHaveBeenCalledTimes(2);
  });

  it('shares one probe between simultaneous callers, so polling cannot multiply database load', async () => {
    const database = db();
    state.pool.query.mockResolvedValue({ rows: [] });
    const answers = await Promise.all([database.checkReadiness(), database.checkReadiness(), database.checkReadiness()]);
    expect(answers).toEqual([true, true, true]);
    expect(state.pool.query).toHaveBeenCalledTimes(1);
  });

  it('reports not ready on any failure without throwing, logging only the error code', async () => {
    const database = db();
    state.pool.query.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED 10.1.2.3:5432 password=s3cret'), { code: 'ECONNREFUSED' }));
    expect(await database.checkReadiness()).toBe(false);
    expect(log).toHaveBeenCalledWith('database.unavailable', { code: 'ECONNREFUSED' });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/10\.1\.2\.3|s3cret/);
    // The failure is cached briefly too (a down database is not hammered), then it recovers.
    state.pool.query.mockResolvedValue({ rows: [] });
    expect(await database.checkReadiness()).toBe(false);
    now += READINESS_CACHE_MS + 1;
    expect(await database.checkReadiness()).toBe(true);
  });

  it('survives a dropped idle connection: the pool error is logged by code and not thrown', () => {
    db();
    expect(state.pool.handlers['error']).toBeTypeOf('function');
    expect(() => state.pool.handlers['error'](Object.assign(new Error('terminating connection at 10.1.2.3'), { code: '57P01' }))).not.toThrow();
    expect(log).toHaveBeenCalledWith('database.pool-error', { code: '57P01' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('10.1.2.3');
  });

  it('closes the pool on shutdown', async () => {
    await db().close();
    expect(state.pool.end).toHaveBeenCalledTimes(1);
  });
});
