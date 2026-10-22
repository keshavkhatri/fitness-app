import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCOUNT_DELETE_PATH, AccountStore, createAccountRoutes } from '../src/account/account-routes';
import type { Identity } from '../src/auth/auth-routes';
import { AuthUnavailableError } from '../src/auth/auth-routes';
import { migrateUp } from '../src/db/migrations';
import { loadMigrations } from '../tools/migration-files';
import { MIGRATIONS_DIRECTORY, newDatabase, sqlClient } from './pglite';

const ORIGIN = 'https://localhost';
const identity = (userId: string): Identity => ({ userId, email: `${userId}@example.test`, name: userId, emailVerified: true, sessionExpiresAt: '2026-11-01T00:00:00.000Z' });

let db: PGlite;
beforeAll(async () => {
  db = await newDatabase();
  await migrateUp(sqlClient(db), await loadMigrations(MIGRATIONS_DIRECTORY));
}, 60_000);

/** Two accounts, each with a session, a linked account, a push device and a pending reset token. */
beforeEach(async () => {
  await db.query('DELETE FROM auth."user"');
  await db.query('DELETE FROM auth.verification');
  for (const id of ['u-del-a', 'u-del-b']) {
    await db.query('INSERT INTO auth."user" (id, name, email, "emailVerified") VALUES ($1, $1, $2, true)', [id, `${id}@example.test`]);
    await db.query(`INSERT INTO auth."session" (id, "expiresAt", token, "updatedAt", "userId") VALUES ($1, now() + interval '1 day', $1, now(), $2)`, [`s-${id}`, id]);
    await db.query(`INSERT INTO auth."account" (id, "accountId", "providerId", "userId", "updatedAt") VALUES ($1, $1, 'google', $2, now())`, [`a-${id}`, id]);
    await db.query(`INSERT INTO stokeform.push_devices (user_id, token, platform) VALUES ($1, $2, 'android')`, [id, `fcm-token-${id}-aaaaaaaaaaaaaaaa`]);
    await db.query(`INSERT INTO auth.verification (id, identifier, value, "expiresAt") VALUES ($1, $1, $2, now() + interval '1 hour')`, [`v-${id}`, id]);
  }
});

const store: AccountStore = { query: async (text, values) => ({ rows: (await db.query<Record<string, unknown>>(text, values)).rows }) };
const count = async (sql: string) => Number((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`)).rows[0].n);

function setup({ signedIn = 'u-del-a' as string | null, authenticate = undefined as undefined | (() => Promise<Identity | null>) } = {}) {
  const events: string[] = [];
  const routes = createAccountRoutes({
    store,
    authenticate: authenticate ?? (async () => (signedIn ? identity(signedIn) : null)),
    allowedOrigins: [ORIGIN],
    log: (event) => void events.push(event),
  });
  const post = (body?: unknown, { origin = ORIGIN, method = 'POST', path = ACCOUNT_DELETE_PATH } = {}) =>
    routes.handle(
      new Request(`https://api.example${path}`, {
        method,
        headers: { origin, 'content-type': 'application/json', authorization: 'Bearer t' },
        body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
      }),
      { clientId: 'c' } as never,
    );
  return { routes, post, events };
}

describe('account deletion', () => {
  it('deletes the signed-in account and everything it owns, and nothing of anyone else', async () => {
    const { post, events } = setup();
    const response = await post({ confirm: 'DELETE' });
    expect(response.status).toBe(204);
    expect(await count(`auth."user" WHERE id = 'u-del-a'`)).toBe(0);
    expect(await count(`auth."session" WHERE "userId" = 'u-del-a'`)).toBe(0);
    expect(await count(`auth."account" WHERE "userId" = 'u-del-a'`)).toBe(0);
    expect(await count(`stokeform.push_devices WHERE user_id = 'u-del-a'`)).toBe(0);
    expect(await count(`auth.verification WHERE value = 'u-del-a'`)).toBe(0);
    // The other account is untouched.
    expect(await count(`auth."user" WHERE id = 'u-del-b'`)).toBe(1);
    expect(await count(`auth."session" WHERE "userId" = 'u-del-b'`)).toBe(1);
    expect(await count(`stokeform.push_devices WHERE user_id = 'u-del-b'`)).toBe(1);
    expect(await count(`auth.verification WHERE value = 'u-del-b'`)).toBe(1);
    expect(events).toEqual(['account.deleted']);
  });

  it('needs the typed confirmation, and a session (the body can never name the account)', async () => {
    expect((await setup().post({})).status).toBe(400);
    expect((await setup().post({ confirm: 'delete' })).status).toBe(400);
    expect((await setup().post({ confirm: 'DELETE', userId: 'u-del-b' })).status).toBe(204);
    expect(await count(`auth."user" WHERE id = 'u-del-b'`)).toBe(1);
    const anonymous = await setup({ signedIn: null }).post({ confirm: 'DELETE' });
    expect(anonymous.status).toBe(401);
    expect(await count('auth."user"')).toBe(1);
  });

  it('only from allowed origins, by POST, on its own path', async () => {
    expect((await setup().post({ confirm: 'DELETE' }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await setup().post(undefined, { method: 'GET' })).status).toBe(405);
    expect((await setup().post({ confirm: 'DELETE' }, { path: '/v1/account/other' })).status).toBe(404);
    expect(await count('auth."user"')).toBe(2);
    expect(setup().routes.owns('/v1/account/delete')).toBe(true);
    expect(setup().routes.owns('/v1/push/test')).toBe(false);
  });

  it('answers 503 (deleting nothing) when accounts are unavailable', async () => {
    const offline = await setup({
      authenticate: async () => {
        throw new AuthUnavailableError();
      },
    }).post({ confirm: 'DELETE' });
    expect(offline.status).toBe(503);
    const noStore = createAccountRoutes({ store: null, authenticate: async () => identity('u-del-a'), allowedOrigins: [ORIGIN], log: () => undefined });
    const response = await noStore.handle(
      new Request(`https://api.example${ACCOUNT_DELETE_PATH}`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{"confirm":"DELETE"}' }),
      { clientId: 'c' } as never,
    );
    expect(response.status).toBe(503);
    expect(await count('auth."user"')).toBe(2);
  });
});
