import type { Identity } from '../auth/auth-routes';
import { AuthUnavailableError } from '../auth/auth-routes';
import type { Log, RequestContext } from '../extraction-handler';
import type { SyncCipher } from './sync-crypto';

export const SYNC_PUSH_PATH = '/v1/sync/push';
export const SYNC_PULL_PATH = '/v1/sync/pull';
export const SYNC_CLEAR_PATH = '/v1/sync/clear';

/** The queries these routes need (a pg Pool, or PGlite in tests). Values are always parameters. */
export interface SyncStore {
  query(text: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface SyncRoutes {
  owns(pathname: string): boolean;
  handle(request: Request, context: RequestContext): Promise<Response>;
}

export interface SyncRoutesDeps {
  readonly store: SyncStore | null;
  /** null: sync isn't configured (no SYNC_ENCRYPTION_KEY): every request answers 503. */
  readonly cipher: SyncCipher | null;
  readonly authenticate: (request: Request) => Promise<Identity | null>;
  readonly allowedOrigins: readonly string[];
  readonly log: Log;
  readonly now?: () => Date;
}

/** Only the app's own data keys (core/storage): "fitness.workout-logs", "stokeform.water-log" … */
export const SYNC_KEY_PATTERN = /^(fitness|stokeform)\.[a-z0-9][a-z0-9.-]{0,100}$/;
/** One request: at most this many entries and bytes (a phone sends large histories in several requests). */
const MAX_ENTRIES = 100;
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
/** One stored value (a long workout history, a profile photo); the table allows 8 MiB of base64 (about 6 MiB). */
const MAX_VALUE_BYTES = 6 * 1024 * 1024 - 64;
/** One pull answers at most this many entries / bytes; `more` says to ask again. */
const PULL_LIMIT = 50;
const PULL_BYTES = 6 * 1024 * 1024;
/** Requests per account per minute (a phone syncs on open, on return and after changes). */
const PER_MINUTE = 60;
/** The service is for adults; the profile carries the date of birth (domain/fitness-profile). */
const MINIMUM_AGE = 18;
const PROFILE_KEY = 'fitness.profile';

const BASE_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } as const;

/** Whole years between a "YYYY-MM-DD" date of birth and today (UTC); null when the date isn't valid. */
export function ageOn(dateOfBirth: unknown, today: Date): number | null {
  if (typeof dateOfBirth !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    return null;
  }
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  const born = new Date(Date.UTC(y, m - 1, d));
  if (born.getUTCFullYear() !== y || born.getUTCMonth() !== m - 1 || born.getUTCDate() !== d) {
    return null;
  }
  let age = today.getUTCFullYear() - y;
  if (today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d)) {
    age--;
  }
  return age;
}

/** The date of birth in a stored profile value ({ version, profile: { dateOfBirth } }), if any. */
function dateOfBirthIn(value: string): unknown {
  try {
    const parsed = JSON.parse(value) as { profile?: { dateOfBirth?: unknown } } | null;
    return parsed?.profile?.dateOfBirth;
  } catch {
    return undefined;
  }
}

/**
 * Cloud backup and sync of the app's on-phone data, per account (opt-in in the app). Each entry is one storage key's
 * whole value; the newest change wins per key (by when it was made on the phone). Values are encrypted with the
 * server's key before they are stored. The account comes only from the verified session, never from the body.
 *
 * The minimum age is enforced here: a profile whose date of birth makes the person younger than 18 is refused.
 */
export function createSyncRoutes({ store, cipher, authenticate, allowedOrigins, log, now = () => new Date() }: SyncRoutesDeps): SyncRoutes {
  const recent = new Map<string, number[]>();

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
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > MAX_REQUEST_BYTES) {
      return null;
    }
    const raw = await request.text();
    if (raw.length > MAX_REQUEST_BYTES) {
      return null;
    }
    try {
      const body = JSON.parse(raw) as unknown;
      return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  /** At most PER_MINUTE requests per account in any minute (in memory: the service runs one instance). */
  function allowed(userId: string): boolean {
    const t = now().getTime();
    const times = (recent.get(userId) ?? []).filter((at) => t - at < 60_000);
    if (times.length >= PER_MINUTE) {
      recent.set(userId, times);
      return false;
    }
    times.push(t);
    recent.set(userId, times);
    return true;
  }

  interface Entry {
    readonly key: string;
    readonly value: string | null;
    readonly modifiedAt: Date;
  }

  function entriesOf(body: Record<string, unknown> | null): Entry[] | string {
    const list = body?.['entries'];
    if (!Array.isArray(list) || list.length === 0 || list.length > MAX_ENTRIES) {
      return `Send 1 to ${MAX_ENTRIES} entries.`;
    }
    const seen = new Set<string>();
    const out: Entry[] = [];
    for (const raw of list) {
      const e = raw as Record<string, unknown> | null;
      const key = e?.['key'];
      const value = e?.['value'];
      const modifiedAt = typeof e?.['modifiedAt'] === 'string' ? new Date(e['modifiedAt']) : null;
      if (typeof key !== 'string' || !SYNC_KEY_PATTERN.test(key) || seen.has(key)) {
        return 'Each entry needs a valid, distinct key.';
      }
      if (value !== null && (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_VALUE_BYTES)) {
        return 'Each value is text (or null for a deletion) within the size limit.';
      }
      // A little clock skew is fine; a time far in the future would win every later change.
      if (!modifiedAt || Number.isNaN(modifiedAt.getTime()) || modifiedAt.getTime() > now().getTime() + 5 * 60_000) {
        return 'Each entry needs the time it was changed.';
      }
      seen.add(key);
      out.push({ key, value: value as string | null, modifiedAt });
    }
    return out;
  }

  async function latestRevision(userId: string): Promise<number> {
    const { rows } = await store!.query('SELECT COALESCE(max(revision), 0)::bigint AS revision FROM stokeform.sync_entries WHERE user_id = $1', [userId]);
    return Number(rows[0]?.['revision'] ?? 0);
  }

  return {
    owns: (pathname) => pathname.startsWith('/v1/sync/'),

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
      if (![SYNC_PUSH_PATH, SYNC_PULL_PATH, SYNC_CLEAR_PATH].includes(pathname)) {
        return error(404, 'not-found', 'Not found.', origin);
      }
      if (request.method !== 'POST') {
        return error(405, 'method-not-allowed', 'Method not allowed.', origin, { allow: 'POST, OPTIONS' });
      }
      if (!store || !cipher) {
        return error(503, 'sync-not-configured', "Backup isn't available right now.", origin);
      }
      try {
        const me = await authenticate(request);
        if (!me) {
          return error(401, 'unauthenticated', 'Sign in to continue.', origin, { 'www-authenticate': 'Bearer' });
        }
        if (!allowed(me.userId)) {
          return error(429, 'too-many-requests', 'Too many requests. Try again in a minute.', origin, { 'retry-after': '60' });
        }
        const body = await readBody(request);

        if (pathname === SYNC_CLEAR_PATH) {
          // Turning backup off: the cloud copy goes (the phone keeps its own data).
          await store.query('DELETE FROM stokeform.sync_entries WHERE user_id = $1', [me.userId]);
          log('sync.cleared', {});
          return json(204, null, origin);
        }

        if (pathname === SYNC_PULL_PATH) {
          const since = Number(body?.['since'] ?? 0);
          if (!Number.isSafeInteger(since) || since < 0) {
            return error(400, 'invalid-request', 'Send the last revision seen.', origin);
          }
          const { rows } = await store.query(
            `SELECT key, value, modified_at, revision FROM stokeform.sync_entries
             WHERE user_id = $1 AND revision > $2 ORDER BY revision LIMIT ${PULL_LIMIT + 1}`,
            [me.userId, since],
          );
          const entries: { key: string; value: string | null; modifiedAt: string; revision: number }[] = [];
          let bytes = 0;
          let more = rows.length > PULL_LIMIT;
          for (const row of rows.slice(0, PULL_LIMIT)) {
            const key = row['key'] as string;
            const sealed = row['value'] as string | null;
            const value = sealed ? cipher.open(me.userId, key, Buffer.from(sealed, 'base64')) : null;
            bytes += value?.length ?? 0;
            if (entries.length > 0 && bytes > PULL_BYTES) {
              more = true;
              break;
            }
            entries.push({ key, value, modifiedAt: new Date(row['modified_at'] as string | Date).toISOString(), revision: Number(row['revision']) });
          }
          const revision = entries.length ? entries[entries.length - 1].revision : since;
          return json(200, { entries, revision, more }, origin);
        }

        // Push.
        const entries = entriesOf(body);
        if (typeof entries === 'string') {
          return error(400, 'invalid-request', entries, origin);
        }
        const profile = entries.find((e) => e.key === PROFILE_KEY && e.value !== null);
        if (profile) {
          const age = ageOn(dateOfBirthIn(profile.value!), now());
          if (age !== null && age < MINIMUM_AGE) {
            log('sync.under-age', {});
            return error(403, 'under-age', `StokeForm is for people aged ${MINIMUM_AGE} and over.`, origin);
          }
        }
        let accepted = 0;
        for (const e of entries) {
          const sealed = e.value === null ? null : cipher.seal(me.userId, e.key, e.value).toString('base64');
          // Newest change wins: an older change (from a phone that was offline) doesn't overwrite a newer one.
          const { rows } = await store.query(
            `INSERT INTO stokeform.sync_entries (user_id, key, value, modified_at) VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, key) DO UPDATE
               SET value = EXCLUDED.value, modified_at = EXCLUDED.modified_at,
                   revision = nextval('stokeform.sync_revision'), updated_at = now()
               WHERE stokeform.sync_entries.modified_at < EXCLUDED.modified_at
             RETURNING revision`,
            [me.userId, e.key, sealed, e.modifiedAt.toISOString()],
          );
          accepted += rows.length;
        }
        return json(200, { accepted, revision: await latestRevision(me.userId) }, origin);
      } catch (e) {
        if (!(e instanceof AuthUnavailableError)) {
          log('sync.error', { errorName: e instanceof Error ? e.name : typeof e });
        }
        return error(503, 'sync-unavailable', "Backup isn't available right now. Try again later.", origin);
      }
    },
  };
}
