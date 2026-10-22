import type { Identity } from '../auth/auth-routes';
import { AuthUnavailableError } from '../auth/auth-routes';
import type { Log, RequestContext } from '../extraction-handler';

export const ACCOUNT_DELETE_PATH = '/v1/account/delete';

/** The word the app sends to confirm (the user types it): a stray or replayed request can't delete an account. */
export const DELETE_CONFIRMATION = 'DELETE';

/** The queries these routes need (a pg Pool, or PGlite in tests). Values are always parameters. */
export interface AccountStore {
  query(text: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface AccountRoutes {
  owns(pathname: string): boolean;
  handle(request: Request, context: RequestContext): Promise<Response>;
}

export interface AccountRoutesDeps {
  readonly store: AccountStore | null;
  readonly authenticate: (request: Request) => Promise<Identity | null>;
  readonly allowedOrigins: readonly string[];
  readonly log: Log;
}

const BASE_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } as const;
const MAX_JSON_BYTES = 1024;

/**
 * Deleting one's own account (Google Play's account-deletion requirement), from the app while signed in.
 *
 * One statement removes the account: every StokeForm table references auth."user" with ON DELETE CASCADE (sessions,
 * linked Google accounts, push devices, and any synced data), and pending password-reset tokens (which point at the
 * user by value, not by key) go with it. The account comes only from the verified session, never from the body;
 * the body must carry the typed confirmation. Fitness data on the phone isn't on the server: the app clears it.
 */
export function createAccountRoutes({ store, authenticate, allowedOrigins, log }: AccountRoutesDeps): AccountRoutes {
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

  return {
    owns: (pathname) => pathname.startsWith('/v1/account/'),

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
      if (pathname !== ACCOUNT_DELETE_PATH) {
        return error(404, 'not-found', 'Not found.', origin);
      }
      if (request.method !== 'POST') {
        return error(405, 'method-not-allowed', 'Method not allowed.', origin, { allow: 'POST, OPTIONS' });
      }
      if (!store) {
        return error(503, 'accounts-not-configured', "Accounts aren't available right now.", origin);
      }
      try {
        const me = await authenticate(request);
        if (!me) {
          return error(401, 'unauthenticated', 'Sign in to continue.', origin, { 'www-authenticate': 'Bearer' });
        }
        const body = await readBody(request);
        if (body?.['confirm'] !== DELETE_CONFIRMATION) {
          return error(400, 'confirmation-required', `Type ${DELETE_CONFIRMATION} to confirm.`, origin);
        }
        // One statement, so it is all or nothing.
        const result = await store.query(
          `WITH tokens AS (DELETE FROM auth.verification WHERE value = $1),
                gone AS (DELETE FROM auth."user" WHERE id = $1 RETURNING id)
           SELECT count(*)::int AS deleted FROM gone`,
          [me.userId],
        );
        const deleted = Number(result.rows[0]?.['deleted'] ?? 0);
        // No identifiers in the log: only that an account was deleted.
        log('account.deleted', { deleted });
        return json(204, null, origin);
      } catch (e) {
        if (!(e instanceof AuthUnavailableError)) {
          log('account.delete-failed', { errorName: e instanceof Error ? e.name : typeof e });
        }
        return error(503, 'account-unavailable', "Your account couldn't be deleted right now. Try again later.", origin);
      }
    },
  };
}
