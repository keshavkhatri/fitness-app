import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Identity } from '../src/auth/auth-routes';
import { migrateUp } from '../src/db/migrations';
import { PushMessage, PushSender, SendResult, createFcmSender } from '../src/push/fcm';
import { PUSH_DEVICES_PATH, PUSH_DEVICES_REMOVE_PATH, PUSH_TEST_PATH, PushStore, createPushRoutes } from '../src/push/push-routes';
import { loadMigrations } from '../tools/migration-files';
import { MIGRATIONS_DIRECTORY, newDatabase, sqlClient } from './pglite';

const ORIGIN = 'https://localhost';
const TOKEN_A = 'fcm-token-aaaaaaaaaaaaaaaaaaaa:APA91b';
const TOKEN_B = 'fcm-token-bbbbbbbbbbbbbbbbbbbb:APA91b';
const identity = (userId: string): Identity => ({ userId, email: `${userId}@example.test`, name: userId, emailVerified: true, sessionExpiresAt: '2026-11-01T00:00:00.000Z' });

let db: PGlite;
beforeAll(async () => {
  db = await newDatabase();
  await migrateUp(sqlClient(db), await loadMigrations(MIGRATIONS_DIRECTORY));
  for (const id of ['u-push-a', 'u-push-b']) {
    await db.query('INSERT INTO auth."user" (id, name, email, "emailVerified") VALUES ($1, $1, $2, true)', [id, `${id}@example.test`]);
  }
}, 60_000);
beforeEach(async () => {
  await db.query('DELETE FROM stokeform.push_devices');
});

const store: PushStore = { query: async (text, values) => ({ rows: (await db.query<Record<string, unknown>>(text, values)).rows }) };
const devices = async () => (await db.query<{ user_id: string; token: string }>('SELECT user_id, token FROM stokeform.push_devices ORDER BY user_id, token')).rows;

function setup({ signedIn = 'u-push-a' as string | null, results = {} as Record<string, SendResult>, now = (() => 1_000_000) as () => number } = {}) {
  const sent: { token: string; message: PushMessage }[] = [];
  const sender: PushSender = {
    send: async (token, message) => {
      sent.push({ token, message });
      return results[token] ?? 'sent';
    },
  };
  const routes = createPushRoutes({
    store,
    sender,
    authenticate: async () => (signedIn ? identity(signedIn) : null),
    allowedOrigins: [ORIGIN],
    log: () => undefined,
    now,
  });
  const post = (path: string, body?: unknown, origin = ORIGIN) =>
    routes.handle(
      new Request(`https://api.example${path}`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json', authorization: 'Bearer t' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { clientId: 'c' } as never,
    );
  return { routes, post, sent };
}

describe('push device routes', () => {
  it('registers a device for the signed-in account only (the body cannot name the account)', async () => {
    const { post } = setup();
    expect((await post(PUSH_DEVICES_PATH, { token: TOKEN_A, platform: 'android', userId: 'u-push-b' })).status).toBe(204);
    expect(await devices()).toEqual([{ user_id: 'u-push-a', token: TOKEN_A }]);
    // Registering again just refreshes it.
    expect((await post(PUSH_DEVICES_PATH, { token: TOKEN_A, platform: 'android' })).status).toBe(204);
    expect(await devices()).toHaveLength(1);
  });

  it('moves a token to the account that registers it last (another account signed in on the phone)', async () => {
    await setup({ signedIn: 'u-push-a' }).post(PUSH_DEVICES_PATH, { token: TOKEN_A, platform: 'android' });
    await setup({ signedIn: 'u-push-b' }).post(PUSH_DEVICES_PATH, { token: TOKEN_A, platform: 'android' });
    expect(await devices()).toEqual([{ user_id: 'u-push-b', token: TOKEN_A }]);
  });

  it('removes only the caller’s own device', async () => {
    await setup({ signedIn: 'u-push-a' }).post(PUSH_DEVICES_PATH, { token: TOKEN_A, platform: 'android' });
    expect((await setup({ signedIn: 'u-push-b' }).post(PUSH_DEVICES_REMOVE_PATH, { token: TOKEN_A })).status).toBe(204);
    expect(await devices()).toHaveLength(1);
    await setup({ signedIn: 'u-push-a' }).post(PUSH_DEVICES_REMOVE_PATH, { token: TOKEN_A });
    expect(await devices()).toEqual([]);
  });

  it('refuses the signed-out, bad tokens, unknown platforms and foreign origins', async () => {
    expect((await setup({ signedIn: null }).post(PUSH_DEVICES_PATH, { token: TOKEN_A, platform: 'android' })).status).toBe(401);
    const { post } = setup();
    expect((await post(PUSH_DEVICES_PATH, { token: 'short', platform: 'android' })).status).toBe(400);
    expect((await post(PUSH_DEVICES_PATH, { token: `${TOKEN_A}<script>`, platform: 'android' })).status).toBe(400);
    expect((await post(PUSH_DEVICES_PATH, { token: TOKEN_A, platform: 'windows' })).status).toBe(400);
    expect((await post(PUSH_DEVICES_PATH, { token: TOKEN_A, platform: 'android' }, 'https://evil.example')).status).toBe(403);
    expect(await devices()).toEqual([]);
  });

  it('sends a test to every device of the account, forgets tokens Firebase no longer knows, and limits how often', async () => {
    let time = 1_000_000;
    const { post, sent } = setup({ results: { [TOKEN_B]: 'gone' }, now: () => time });
    await post(PUSH_DEVICES_PATH, { token: TOKEN_A, platform: 'android' });
    await post(PUSH_DEVICES_PATH, { token: TOKEN_B, platform: 'android' });
    const response = await post(PUSH_TEST_PATH);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ devices: 2, sent: 1 });
    expect(sent.map((s) => s.token).sort()).toEqual([TOKEN_A, TOKEN_B]);
    expect(sent[0].message.data).toEqual({ type: 'test' });
    expect(await devices()).toEqual([{ user_id: 'u-push-a', token: TOKEN_A }]);

    expect((await post(PUSH_TEST_PATH)).status).toBe(429);
    time += 31_000;
    expect((await post(PUSH_TEST_PATH)).status).toBe(200);
  });

  it('keeps at most 10 devices per account (the most recently seen)', async () => {
    const { post } = setup();
    for (let i = 0; i < 12; i++) {
      await post(PUSH_DEVICES_PATH, { token: `fcm-token-${String(i).padStart(2, '0')}-xxxxxxxxxxxxxxx`, platform: 'android' });
    }
    expect(await devices()).toHaveLength(10);
  });
});

describe('FCM sender', () => {
  const metadata = (url: string) =>
    url.endsWith('/token') ? Response.json({ access_token: 'at', expires_in: 3600 }) : url.endsWith('/project-id') ? new Response('fitness-app-511714') : null;

  it('sends with the service identity’s token to the project, on the private reminders channel', async () => {
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => metadata(String(input)) ?? Response.json({ name: 'm/1' }));
    const sender = createFcmSender({ projectId: null, fetch: fetch as typeof globalThis.fetch, log: () => undefined });
    expect(await sender.send(TOKEN_A, { title: 'T', body: 'B', data: { type: 'test' } })).toBe('sent');
    expect(await sender.send(TOKEN_B, { title: 'T', body: 'B' })).toBe('sent');
    const sends = fetch.mock.calls.filter(([u]) => String(u).startsWith('https://fcm.googleapis.com/'));
    expect(String(sends[0][0])).toBe('https://fcm.googleapis.com/v1/projects/fitness-app-511714/messages:send');
    expect((sends[0][1]?.headers as Record<string, string>)['authorization']).toBe('Bearer at');
    expect(JSON.parse(String(sends[0][1]?.body)).message).toEqual({
      token: TOKEN_A,
      notification: { title: 'T', body: 'B' },
      data: { type: 'test' },
      android: { priority: 'high', notification: { channel_id: 'reminders', visibility: 'PRIVATE' } },
    });
    // The access token and project are fetched once and reused.
    expect(fetch.mock.calls.filter(([u]) => String(u).includes('metadata')).length).toBe(2);
  });

  it('reports an unregistered token as gone, and other errors (or no metadata server) as failed', async () => {
    const answer = (status: number, errorCode: string) =>
      createFcmSender({
        projectId: 'p',
        fetch: (async (input: string | URL | Request) =>
          metadata(String(input)) ?? Response.json({ error: { status: 'X', details: [{ errorCode }] } }, { status })) as typeof globalThis.fetch,
        log: () => undefined,
      });
    expect(await answer(404, 'UNREGISTERED').send(TOKEN_A, { title: 'T', body: 'B' })).toBe('gone');
    expect(await answer(400, 'INVALID_ARGUMENT').send(TOKEN_A, { title: 'T', body: 'B' })).toBe('failed');
    expect(await answer(503, 'UNAVAILABLE').send(TOKEN_A, { title: 'T', body: 'B' })).toBe('failed');
    const offline = createFcmSender({ projectId: 'p', fetch: (async () => Promise.reject(new TypeError('fetch failed'))) as typeof globalThis.fetch, log: () => undefined });
    expect(await offline.send(TOKEN_A, { title: 'T', body: 'B' })).toBe('failed');
  });
});
