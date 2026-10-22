import type { Identity } from '../auth/auth-routes';
import { AuthUnavailableError } from '../auth/auth-routes';
import type { Log, RequestContext } from '../extraction-handler';
import type { PushMessage, PushSender } from './fcm';

export const PUSH_DEVICES_PATH = '/v1/push/devices';
export const PUSH_DEVICES_REMOVE_PATH = '/v1/push/devices/remove';
export const PUSH_TEST_PATH = '/v1/push/test';

/** The queries these routes need (a pg Pool, or PGlite in tests). Values are always parameters. */
export interface PushStore {
  query(text: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface PushRoutes {
  owns(pathname: string): boolean;
  handle(request: Request, context: RequestContext): Promise<Response>;
  /** Sends to every device of one account; tokens Firebase no longer knows are deleted. Never throws. */
  notifyUser(userId: string, message: PushMessage): Promise<{ readonly devices: number; readonly sent: number }>;
}

export interface PushRoutesDeps {
  readonly store: PushStore | null;
  /** null: sending is not configured (registration still works, so devices are ready when it is). */
  readonly sender: PushSender | null;
  readonly authenticate: (request: Request) => Promise<Identity | null>;
  readonly allowedOrigins: readonly string[];
  readonly log: Log;
  readonly now?: () => number;
}

const BASE_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } as const;
const MAX_JSON_BYTES = 8192;
/** FCM registration tokens: URL-safe base64 with ':' and '-' separators. */
const TOKEN_PATTERN = /^[A-Za-z0-9_:\-]{20,4096}$/;
/** One account keeps at most this many devices (oldest dropped): bounds a single account's rows. */
const MAX_DEVICES_PER_USER = 10;
const TEST_INTERVAL_MS = 30_000;

export function createPushRoutes({ store, sender, authenticate, allowedOrigins, log, now = Date.now }: PushRoutesDeps): PushRoutes {
  const lastTest = new Map<string, number>();

  const corsHeaders = (origin: string | null): Record<string, string> =>
    origin && allowedOrigins.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : { vary: 'Origin' };
  const json = (status: number, body: unknown, origin: string | null, headers: Record<string, string> = {}) =>
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { ...BASE_HEADERS, ...corsHeaders(origin), ...(status === 204 ? {} : { 'content-type': 'application/json; charset=utf-8' }), ...headers },
    });
  const error = (status: number, code: string, message: string, origin: string | null, headers: Record<string, string> = {}) =>
    json(status, { error: { code, message } }, origin, headers);

  async function readBody(request: Request): Promise<Record<string, unknown> | null> {
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return null;
    }
    const raw = await request.text();
    if (raw.length > MAX_JSON_BYTES) {
      return null;
    }
    try {
      const body = JSON.parse(raw) as unknown;
      return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  async function notifyUser(userId: string, message: PushMessage): Promise<{ devices: number; sent: number }> {
    if (!store || !sender) {
      return { devices: 0, sent: 0 };
    }
    try {
      const tokens = (await store.query('SELECT token FROM stokeform.push_devices WHERE user_id = $1', [userId])).rows.map((r) => r['token'] as string);
      let sent = 0;
      for (const token of tokens) {
        const result = await sender.send(token, message);
        if (result === 'sent') {
          sent++;
        } else if (result === 'gone') {
          await store.query('DELETE FROM stokeform.push_devices WHERE user_id = $1 AND token = $2', [userId, token]);
        }
      }
      return { devices: tokens.length, sent };
    } catch (e) {
      log('push.notify-failed', { errorName: e instanceof Error ? e.name : typeof e });
      return { devices: 0, sent: 0 };
    }
  }

  return {
    owns: (pathname) => pathname.startsWith('/v1/push/'),
    notifyUser,

    async handle(request) {
      const { pathname } = new URL(request.url);
      const origin = request.headers.get('origin') || null;
      if (origin !== null && !allowedOrigins.includes(origin)) {
        return error(403, 'origin-not-allowed', "This app isn't allowed to use this service.", origin);
      }
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            ...BASE_HEADERS,
            ...corsHeaders(origin),
            'access-control-allow-methods': 'POST',
            'access-control-allow-headers': 'Content-Type, Authorization',
            'access-control-max-age': '600',
          },
        });
      }
      if (![PUSH_DEVICES_PATH, PUSH_DEVICES_REMOVE_PATH, PUSH_TEST_PATH].includes(pathname)) {
        return error(404, 'not-found', 'Not found.', origin);
      }
      if (request.method !== 'POST') {
        return error(405, 'method-not-allowed', 'Method not allowed.', origin, { allow: 'POST, OPTIONS' });
      }
      if (!store) {
        return error(503, 'push-not-configured', "Notifications aren't available right now.", origin);
      }
      try {
        // The account comes only from the verified session, never from the request body.
        const me = await authenticate(request);
        if (!me) {
          return error(401, 'unauthenticated', 'Sign in to continue.', origin, { 'www-authenticate': 'Bearer' });
        }

        if (pathname === PUSH_TEST_PATH) {
          const last = lastTest.get(me.userId) ?? 0;
          if (now() - last < TEST_INTERVAL_MS) {
            return error(429, 'too-many-requests', 'Wait a moment before sending another test.', origin, { 'retry-after': '30' });
          }
          lastTest.set(me.userId, now());
          if (!sender) {
            return error(503, 'push-not-configured', "Notifications aren't available right now.", origin);
          }
          const result = await notifyUser(me.userId, {
            title: 'Notifications are on',
            body: 'StokeForm can reach this phone.',
            data: { type: 'test' },
          });
          return json(200, result, origin);
        }

        const body = await readBody(request);
        const token = typeof body?.['token'] === 'string' ? body['token'] : '';
        if (!TOKEN_PATTERN.test(token)) {
          return error(400, 'invalid-request', 'Send a device token.', origin);
        }

        if (pathname === PUSH_DEVICES_REMOVE_PATH) {
          await store.query('DELETE FROM stokeform.push_devices WHERE user_id = $1 AND token = $2', [me.userId, token]);
          return json(204, null, origin);
        }

        const platform = body?.['platform'];
        if (platform !== 'android' && platform !== 'ios') {
          return error(400, 'invalid-request', 'Send the platform.', origin);
        }
        // A token belongs to one account: registering it here takes it from any other account.
        await store.query('DELETE FROM stokeform.push_devices WHERE token = $1 AND user_id <> $2', [token, me.userId]);
        await store.query(
          `INSERT INTO stokeform.push_devices (user_id, token, platform) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, token) DO UPDATE SET platform = EXCLUDED.platform, last_seen_at = now()`,
          [me.userId, token, platform],
        );
        await store.query(
          `DELETE FROM stokeform.push_devices WHERE user_id = $1 AND token NOT IN (
             SELECT token FROM stokeform.push_devices WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT ${MAX_DEVICES_PER_USER})`,
          [me.userId],
        );
        return json(204, null, origin);
      } catch (e) {
        if (!(e instanceof AuthUnavailableError)) {
          log('push.error', { errorName: e instanceof Error ? e.name : typeof e });
        }
        return error(503, 'push-unavailable', "Notifications aren't available right now. Try again later.", origin);
      }
    },
  };
}
