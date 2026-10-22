import type { PGlite } from '@electric-sql/pglite';
import { randomBytes } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Identity } from '../src/auth/auth-routes';
import { loadConfig } from '../src/config';
import { migrateUp } from '../src/db/migrations';
import { createSyncCipher } from '../src/sync/sync-crypto';
import { SYNC_CLEAR_PATH, SYNC_PULL_PATH, SYNC_PUSH_PATH, SyncStore, ageOn, createSyncRoutes } from '../src/sync/sync-routes';
import { loadMigrations } from '../tools/migration-files';
import { MIGRATIONS_DIRECTORY, newDatabase, sqlClient } from './pglite';

const ORIGIN = 'https://localhost';
const NOW = new Date('2026-10-22T12:00:00Z');
const identity = (userId: string): Identity => ({ userId, email: `${userId}@example.test`, name: userId, emailVerified: true, sessionExpiresAt: '2026-11-01T00:00:00.000Z' });
const profile = (dateOfBirth: string) => JSON.stringify({ version: 2, profile: { dateOfBirth, weight: { kilograms: 94.5 } } });

let db: PGlite;
beforeAll(async () => {
  db = await newDatabase();
  await migrateUp(sqlClient(db), await loadMigrations(MIGRATIONS_DIRECTORY));
  for (const id of ['u-sync-a', 'u-sync-b']) {
    await db.query('INSERT INTO auth."user" (id, name, email, "emailVerified") VALUES ($1, $1, $2, true)', [id, `${id}@example.test`]);
  }
}, 60_000);
beforeEach(async () => {
  await db.query('DELETE FROM stokeform.sync_entries');
});

const store: SyncStore = { query: async (text, values) => ({ rows: (await db.query<Record<string, unknown>>(text, values)).rows }) };
const cipher = createSyncCipher(randomBytes(32));

function setup(user: string | null = 'u-sync-a', { now = () => NOW } = {}) {
  const routes = createSyncRoutes({ store, cipher, authenticate: async () => (user ? identity(user) : null), allowedOrigins: [ORIGIN], log: () => undefined, now });
  const post = async (path: string, body: unknown) => {
    const response = await routes.handle(
      new Request(`https://api.example${path}`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', authorization: 'Bearer t' }, body: JSON.stringify(body) }),
      { clientId: 'c' } as never,
    );
    return { status: response.status, body: response.status === 204 ? null : ((await response.json()) as Record<string, unknown>) };
  };
  return { routes, post };
}

const entry = (key: string, value: string | null, modifiedAt: string) => ({ key, value, modifiedAt });

describe('cloud sync', () => {
  it('stores pushed values encrypted, and a pull returns them', async () => {
    const { post } = setup();
    const pushed = await post(SYNC_PUSH_PATH, { entries: [entry('fitness.profile', profile('1990-05-01'), '2026-10-22T10:00:00Z'), entry('fitness.water-log', '{"days":{}}', '2026-10-22T10:00:00Z')] });
    expect(pushed).toMatchObject({ status: 200, body: { accepted: 2 } });
    const raw = (await db.query<{ value: string }>(`SELECT value FROM stokeform.sync_entries WHERE key = 'fitness.profile'`)).rows[0].value;
    expect(Buffer.from(raw, 'base64').toString('utf8')).not.toContain('1990');
    expect(raw).not.toContain('1990');
    const pulled = await post(SYNC_PULL_PATH, { since: 0 });
    expect(pulled.status).toBe(200);
    const entries = pulled.body!['entries'] as { key: string; value: string; modifiedAt: string }[];
    expect(entries.map((e) => e.key).sort()).toEqual(['fitness.profile', 'fitness.water-log']);
    expect(entries.find((e) => e.key === 'fitness.profile')!.value).toBe(profile('1990-05-01'));
    expect(pulled.body!['more']).toBe(false);
    // Nothing new since the last revision seen.
    expect((await post(SYNC_PULL_PATH, { since: pulled.body!['revision'] })).body!['entries']).toEqual([]);
  });

  it('the newest change wins per key; an older one (from a phone that was offline) is ignored', async () => {
    const { post } = setup();
    await post(SYNC_PUSH_PATH, { entries: [entry('fitness.workout-logs', 'new', '2026-10-22T11:00:00Z')] });
    expect((await post(SYNC_PUSH_PATH, { entries: [entry('fitness.workout-logs', 'old', '2026-10-22T09:00:00Z')] })).body!['accepted']).toBe(0);
    const pulled = (await post(SYNC_PULL_PATH, { since: 0 })).body!['entries'] as { value: string }[];
    expect(pulled.map((e) => e.value)).toEqual(['new']);
  });

  it('a deletion syncs as null, and other phones see changes after their last revision only', async () => {
    const { post } = setup();
    await post(SYNC_PUSH_PATH, { entries: [entry('fitness.identity', 'photo', '2026-10-22T10:00:00Z')] });
    const first = (await post(SYNC_PULL_PATH, { since: 0 })).body!;
    await post(SYNC_PUSH_PATH, { entries: [entry('fitness.identity', null, '2026-10-22T10:30:00Z')] });
    const next = (await post(SYNC_PULL_PATH, { since: first['revision'] })).body!;
    expect(next['entries']).toEqual([expect.objectContaining({ key: 'fitness.identity', value: null })]);
  });

  it('enforces the minimum age on the server: a profile under 18 is refused, and nothing is stored', async () => {
    const { post } = setup();
    const refused = await post(SYNC_PUSH_PATH, { entries: [entry('fitness.profile', profile('2010-01-01'), '2026-10-22T10:00:00Z'), entry('fitness.water-log', '{}', '2026-10-22T10:00:00Z')] });
    expect(refused).toMatchObject({ status: 403, body: { error: { code: 'under-age' } } });
    expect(Number((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM stokeform.sync_entries')).rows[0].n)).toBe(0);
    // Turning 18 today is allowed.
    expect((await post(SYNC_PUSH_PATH, { entries: [entry('fitness.profile', profile('2008-10-22'), '2026-10-22T10:00:00Z')] })).status).toBe(200);
    expect(ageOn('2008-10-23', NOW)).toBe(17);
    expect(ageOn('2008-02-30', NOW)).toBeNull();
  });

  it('keeps accounts apart, and turning backup off deletes the cloud copy', async () => {
    await setup('u-sync-a').post(SYNC_PUSH_PATH, { entries: [entry('fitness.water-log', 'a', '2026-10-22T10:00:00Z')] });
    await setup('u-sync-b').post(SYNC_PUSH_PATH, { entries: [entry('fitness.water-log', 'b', '2026-10-22T10:00:00Z')] });
    expect(((await setup('u-sync-b').post(SYNC_PULL_PATH, { since: 0 })).body!['entries'] as { value: string }[]).map((e) => e.value)).toEqual(['b']);
    expect((await setup('u-sync-a').post(SYNC_CLEAR_PATH, {})).status).toBe(204);
    expect((await setup('u-sync-a').post(SYNC_PULL_PATH, { since: 0 })).body!['entries']).toEqual([]);
    expect(((await setup('u-sync-b').post(SYNC_PULL_PATH, { since: 0 })).body!['entries'] as unknown[]).length).toBe(1);
  });

  it('a value moved to another account or key fails to decrypt (bound to its row)', () => {
    const sealed = cipher.seal('u-sync-a', 'fitness.profile', 'secret');
    expect(cipher.open('u-sync-a', 'fitness.profile', sealed)).toBe('secret');
    expect(() => cipher.open('u-sync-b', 'fitness.profile', sealed)).toThrow();
    expect(() => cipher.open('u-sync-a', 'fitness.water-log', sealed)).toThrow();
  });

  it('refuses bad input: keys outside the app, duplicates, future times, no session', async () => {
    const { post } = setup();
    expect((await post(SYNC_PUSH_PATH, { entries: [entry('auth.session', 'x', '2026-10-22T10:00:00Z')] })).status).toBe(400);
    expect((await post(SYNC_PUSH_PATH, { entries: [entry('fitness.a', 'x', '2026-10-22T10:00:00Z'), entry('fitness.a', 'y', '2026-10-22T10:00:00Z')] })).status).toBe(400);
    expect((await post(SYNC_PUSH_PATH, { entries: [entry('fitness.a', 'x', '2027-01-01T00:00:00Z')] })).status).toBe(400);
    expect((await post(SYNC_PUSH_PATH, { entries: [] })).status).toBe(400);
    expect((await setup(null).post(SYNC_PULL_PATH, { since: 0 })).status).toBe(401);
  });

  it('pages a large pull', async () => {
    const { post } = setup();
    const many = Array.from({ length: 60 }, (_, i) => entry(`fitness.k${i}`, `v${i}`, '2026-10-22T10:00:00Z'));
    await post(SYNC_PUSH_PATH, { entries: many.slice(0, 50) });
    await post(SYNC_PUSH_PATH, { entries: many.slice(50) });
    const page1 = (await post(SYNC_PULL_PATH, { since: 0 })).body!;
    expect((page1['entries'] as unknown[]).length).toBe(50);
    expect(page1['more']).toBe(true);
    const page2 = (await post(SYNC_PULL_PATH, { since: page1['revision'] })).body!;
    expect((page2['entries'] as unknown[]).length).toBe(10);
    expect(page2['more']).toBe(false);
  });

  it('is off without a key, and the key must be 32 base64 bytes', async () => {
    const off = createSyncRoutes({ store, cipher: null, authenticate: async () => identity('u-sync-a'), allowedOrigins: [ORIGIN], log: () => undefined });
    const response = await off.handle(new Request(`https://api.example${SYNC_PULL_PATH}`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' }), { clientId: 'c' } as never);
    expect(response.status).toBe(503);
    expect(loadConfig({}).sync).toBeNull();
    expect(loadConfig({ SYNC_ENCRYPTION_KEY: randomBytes(32).toString('base64') }).sync?.key.length).toBe(32);
    expect(() => loadConfig({ SYNC_ENCRYPTION_KEY: 'short' })).toThrow();
  });
});
