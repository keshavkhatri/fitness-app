import type { Log, RequestContext } from '../extraction-handler';
import { randomBytes } from 'node:crypto';
import { AUTH_BASE_PATH, Auth, EMAIL_VERIFIED_PATH, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_RESET_MINUTES, RESET_PASSWORD_PATH } from './auth';
import { AuthConfig } from './auth-config';
import { CHALLENGE_PATTERN, HandoffStore, VERIFIER_PATTERN } from './mobile-handoff';

export const ME_PATH = '/v1/auth/me';
/** Which sign-in methods are available, so the app shows only working ones. Public: booleans only. */
export const PROVIDERS_PATH = '/v1/auth/providers';
export const GOOGLE_START_PATH = '/v1/auth/google/start';
export const GOOGLE_COMPLETE_PATH = '/v1/auth/google/complete';
export const MOBILE_EXCHANGE_PATH = '/v1/auth/mobile/exchange';

/** Who is calling, taken only from a session Better Auth verified: never from the request's own claims. */
export interface Identity {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
  readonly sessionExpiresAt: string;
}

/** The database or Better Auth failed: the caller's identity is unknown (not "signed out"). */
export class AuthUnavailableError extends Error {}

export interface AuthRoutes {
  /** Paths these routes own (Better Auth's and /v1/auth/...). */
  owns(pathname: string): boolean;
  handle(request: Request, context: RequestContext): Promise<Response>;
  /**
   * The pattern for every future user-owned endpoint: `const me = await authenticate(request)`;
   * null means 401, and the user id used in queries is `me.userId`, never one sent by the client.
   */
  authenticate(request: Request): Promise<Identity | null>;
}

export interface AuthRoutesDeps {
  /** null: authentication is not configured; its routes answer 503 and nothing else changes. */
  readonly auth: Auth | null;
  readonly config: AuthConfig | null;
  readonly allowedOrigins: readonly string[];
  readonly handoffs: HandoffStore;
  readonly log: Log;
}

const BASE_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } as const;
const MAX_JSON_BYTES = 4096;

export function createAuthRoutes({ auth, config, allowedOrigins, handoffs, log }: AuthRoutesDeps): AuthRoutes {
  const corsHeaders = (origin: string | null): Record<string, string> =>
    origin && allowedOrigins.includes(origin)
      ? { 'access-control-allow-origin': origin, 'access-control-expose-headers': 'set-auth-token', vary: 'Origin' }
      : { vary: 'Origin' };

  const json = (status: number, body: unknown, origin: string | null, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...BASE_HEADERS, ...corsHeaders(origin), 'content-type': 'application/json; charset=utf-8', ...headers },
    });
  const error = (status: number, code: string, message: string, origin: string | null, headers: Record<string, string> = {}) =>
    json(status, { error: { code, message } }, origin, headers);
  const redirect = (location: string, headers: Headers = new Headers()) => {
    headers.set('location', location);
    for (const [name, value] of Object.entries(BASE_HEADERS)) {
      headers.set(name, value);
    }
    return new Response(null, { status: 302, headers });
  };

  async function authenticate(request: Request): Promise<Identity | null> {
    if (!auth) {
      return null;
    }
    let session: Awaited<ReturnType<Auth['api']['getSession']>>;
    try {
      // Only the Authorization header (or, in the browser leg of Google sign-in, the session cookie).
      session = await auth.api.getSession({ headers: request.headers });
    } catch (e) {
      log('auth.session-check-failed', { errorName: e instanceof Error ? e.name : typeof e });
      throw new AuthUnavailableError();
    }
    // An identity is only ever a confirmed one. Better Auth already issues no session to an unconfirmed
    // address; this keeps it true for any session that exists anyway (created before verification was
    // required, or by some future path).
    if (!session || !session.user.emailVerified) {
      return null;
    }
    return {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      emailVerified: session.user.emailVerified,
      sessionExpiresAt: new Date(session.session.expiresAt).toISOString(),
    };
  }

  /** The app return URL and challenge carried through the Google flow, validated each time they are read. */
  function handoffParams(url: URL): { redirectTo: string; challenge: string } | null {
    const redirectTo = url.searchParams.get('redirect') ?? '';
    const challenge = url.searchParams.get('challenge') ?? '';
    if (!config || !config.appRedirectUrls.includes(redirectTo) || !CHALLENGE_PATTERN.test(challenge)) {
      return null;
    }
    return { redirectTo, challenge };
  }
  const withQuery = (base: string, params: Record<string, string>) => `${base}?${new URLSearchParams(params).toString()}`;

  async function googleStart(url: URL, origin: string | null): Promise<Response> {
    const params = handoffParams(url);
    if (!params) {
      return error(400, 'invalid-request', 'This sign-in link is not valid.', origin);
    }
    if (!config?.google) {
      return error(503, 'google-not-configured', "Google sign-in isn't available right now.", origin);
    }
    const completeUrl = withQuery(`${config.baseUrl}${GOOGLE_COMPLETE_PATH}`, { redirect: params.redirectTo, challenge: params.challenge });
    const response = (await auth!.api.signInSocial({
      // On failure Better Auth adds its own `error` code to errorCallbackURL.
      body: { provider: 'google', callbackURL: completeUrl, errorCallbackURL: `${completeUrl}&failed=1`, disableRedirect: true },
      asResponse: true,
    })) as Response;
    const body = (await response.json().catch(() => null)) as { url?: string } | null;
    if (!response.ok || !body?.url || !body.url.startsWith('https://accounts.google.com/')) {
      log('auth.google-start-failed', { status: response.status });
      return error(502, 'google-unavailable', "Google sign-in couldn't start. Try again.", origin);
    }
    // Better Auth's state cookie must reach the browser that will come back to the callback.
    const headers = new Headers();
    for (const cookie of response.headers.getSetCookie()) {
      headers.append('set-cookie', cookie);
    }
    return redirect(body.url, headers);
  }

  async function googleComplete(request: Request, url: URL): Promise<Response> {
    const params = handoffParams(url);
    if (!params) {
      return error(400, 'invalid-request', 'This sign-in link is not valid.', null);
    }
    const fail = (reason = 'google-sign-in-failed') => redirect(withQuery(params.redirectTo, { error: reason }));
    if (url.searchParams.has('failed') || url.searchParams.has('error')) {
      // Only known codes are passed on, as the app's own words; anything else is a plain failure.
      return fail(GOOGLE_FAILURES[url.searchParams.get('error') ?? ''] ?? 'google-sign-in-failed');
    }
    // In the system browser, right after Better Auth's Google callback set the session cookie.
    if (!(await authenticate(request))) {
      return fail();
    }
    const { token } = await auth!.api.generateOneTimeToken({ headers: request.headers });
    handoffs.remember(token, params.challenge);
    return redirect(withQuery(params.redirectTo, { code: token }));
  }

  async function mobileExchange(request: Request, origin: string | null): Promise<Response> {
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return error(415, 'unsupported-media-type', 'Send JSON.', origin);
    }
    const raw = await request.text();
    if (raw.length > MAX_JSON_BYTES) {
      return error(413, 'too-large', 'Request too large.', origin);
    }
    let body: { code?: unknown; verifier?: unknown };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      return error(400, 'invalid-request', 'Send JSON.', origin);
    }
    const code = typeof body.code === 'string' ? body.code : '';
    const verifier = typeof body.verifier === 'string' ? body.verifier : '';
    const invalid = () => error(400, 'invalid-code', 'This sign-in has expired or was already used. Sign in again.', origin);
    if (!code || code.length > 256 || !VERIFIER_PATTERN.test(verifier) || !handoffs.redeem(code, verifier)) {
      return invalid();
    }
    let result: { headers: Headers; response: { user: { id: string; email: string; name: string; emailVerified: boolean }; session: { expiresAt: Date | string } } };
    try {
      result = (await auth!.api.verifyOneTimeToken({ body: { token: code }, returnHeaders: true })) as typeof result;
    } catch {
      return invalid();
    }
    const token = result.headers.get('set-auth-token');
    if (!token) {
      return invalid();
    }
    const { user, session } = result.response;
    return json(200, { token, user: publicUser(user), session: { expiresAt: new Date(session.expiresAt).toISOString() } }, origin);
  }

  return {
    owns: (pathname) => pathname === AUTH_BASE_PATH || pathname.startsWith(`${AUTH_BASE_PATH}/`) || pathname.startsWith('/v1/auth/'),
    authenticate,

    async handle(request, _context) {
      const url = new URL(request.url);
      const { pathname } = url;
      const origin = request.headers.get('origin') || null;
      try {
        // The app's origins, plus this server's own (the password-reset page posts to it from its own origin).
        if (origin !== null && !allowedOrigins.includes(origin) && origin !== config?.baseUrl && request.method !== 'GET') {
          return error(403, 'origin-not-allowed', "This app isn't allowed to use this service.", origin);
        }
        if (request.method === 'OPTIONS') {
          return new Response(null, {
            status: origin && allowedOrigins.includes(origin) ? 204 : 403,
            headers: {
              ...BASE_HEADERS,
              ...corsHeaders(origin),
              'access-control-allow-methods': 'GET, POST',
              'access-control-allow-headers': 'Content-Type, Authorization',
              'access-control-max-age': '600',
            },
          });
        }
        if (pathname === PROVIDERS_PATH && request.method === 'GET') {
          const emailPassword = auth !== null && config?.email != null;
          const google = auth !== null && config?.google != null;
          return json(200, { accounts: emailPassword || google, emailPassword, google }, origin);
        }
        if (!auth) {
          return error(503, 'auth-not-configured', "Accounts aren't available right now. The app keeps working on this device.", origin);
        }

        if (pathname === ME_PATH) {
          if (request.method !== 'GET') {
            return error(405, 'method-not-allowed', 'Method not allowed.', origin, { allow: 'GET, OPTIONS' });
          }
          // Identity comes from the verified session only: any user id in the query or body is ignored.
          const me = await authenticate(request);
          if (!me) {
            return error(401, 'unauthenticated', 'Sign in to continue.', origin, { 'www-authenticate': 'Bearer' });
          }
          return json(200, { user: { id: me.userId, email: me.email, name: me.name, emailVerified: me.emailVerified }, session: { expiresAt: me.sessionExpiresAt } }, origin);
        }
        if (pathname === GOOGLE_START_PATH && request.method === 'GET') {
          return await googleStart(url, origin);
        }
        if (pathname === GOOGLE_COMPLETE_PATH && request.method === 'GET') {
          return await googleComplete(request, url);
        }
        if (pathname === MOBILE_EXCHANGE_PATH && request.method === 'POST') {
          return await mobileExchange(request, origin);
        }
        if (pathname === EMAIL_VERIFIED_PATH && request.method === 'GET') {
          return emailVerifiedPage(url.searchParams.get('error'));
        }
        if (pathname === RESET_PASSWORD_PATH && request.method === 'GET') {
          return resetPasswordPage();
        }
        // Better Auth's own link target (token in the path, then a redirect) is not used: our emails link
        // straight to the page above, which sends the token to POST /api/auth/reset-password itself.
        if (pathname.startsWith(`${AUTH_BASE_PATH}/reset-password/`)) {
          return error(404, 'not-found', 'Not found.', origin);
        }
        // One-time codes are issued and redeemed only by the routes above (bound to a verifier).
        // A new confirmation link is sent only by signing in with the right password (sendOnSignIn),
        // so the public "send me a link" route, which needs no password, is closed.
        if (pathname.startsWith(`${AUTH_BASE_PATH}/one-time-token`) || pathname === `${AUTH_BASE_PATH}/send-verification-email`) {
          return error(404, 'not-found', 'Not found.', origin);
        }
        if (pathname === AUTH_BASE_PATH || pathname.startsWith(`${AUTH_BASE_PATH}/`)) {
          const response = await auth.handler(request);
          const headers = new Headers(response.headers);
          for (const [name, value] of Object.entries({ ...BASE_HEADERS, ...corsHeaders(origin) })) {
            headers.set(name, value);
          }
          return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
        }
        return error(404, 'not-found', 'Not found.', origin);
      } catch (e) {
        if (!(e instanceof AuthUnavailableError)) {
          log('auth.error', { errorName: e instanceof Error ? e.name : typeof e });
        }
        return error(503, 'auth-unavailable', "Accounts aren't available right now. Try again later.", origin);
      }
    },
  };
}

/** Better Auth's Google callback error codes the app explains specifically (the app's own codes). */
const GOOGLE_FAILURES: Readonly<Record<string, string>> = {
  // An account with this address exists, but its address (or Google's) isn't verified: never joined.
  account_not_linked: 'account-not-linked',
  // Google reports the address as unverified.
  email_not_verified: 'email-not-verified',
};

/**
 * Where a confirmation link lands, in the phone's or computer's browser. Static text only: the
 * `error` code from Better Auth picks one of three fixed messages and is never echoed.
 */
function emailVerifiedPage(errorCode: string | null): Response {
  const [title, message] =
    errorCode === null
      ? ['Email confirmed', 'Your email address is confirmed. Go back to the Pulseform app and sign in with your email and password.']
      : errorCode === 'TOKEN_EXPIRED'
        ? ['This link has expired', 'Open the Pulseform app and sign in with your email and password: we will email you a new link.']
        : ["This link isn't valid", 'It may be incomplete or already replaced. Open the Pulseform app and sign in to get a new link.'];
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Pulseform</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f4f3ef;color:#1a1a1a}main{max-width:28rem;margin:0 auto;padding:3rem 1rem}h1{font-size:1.6rem}p{line-height:1.5}
@media (prefers-color-scheme:dark){body{background:#111;color:#eee}}</style></head>
<body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
  return new Response(html, {
    status: errorCode === null ? 200 : 400,
    headers: {
      ...BASE_HEADERS,
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}

/**
 * Where a password-reset link lands: a small self-contained page to choose a new password, in the person's
 * browser (an email link opens the browser, not the app). It is static: the token is read by the page's own
 * script from the address, removed from the address bar and history at once, and posted to Better Auth's
 * reset endpoint; it is never written into the HTML, so nothing in the URL can be reflected back.
 * A fresh nonce lets only this page's script and style run.
 */
function resetPasswordPage(): Response {
  const nonce = randomBytes(16).toString('base64');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex">
<title>Choose a new password · Pulseform</title>
<style nonce="${nonce}">
:root{color-scheme:light dark}
body{margin:0;font-family:system-ui,sans-serif;background:#f4f3ef;color:#1a1a1a}
main{max-width:28rem;margin:0 auto;padding:2.5rem 1rem}
h1{font-size:1.6rem;margin:0 0 .5rem}p{line-height:1.5}
label{display:block;font-weight:600;margin:1.25rem 0 .35rem}
input{box-sizing:border-box;width:100%;font:inherit;padding:.75rem;border:1px solid #bdbdb5;border-radius:.75rem;background:#fff;color:inherit}
input[aria-invalid=true]{border-color:#c0261d}
.hint{font-size:.9rem;color:#555;margin:.35rem 0 0}
.error{color:#a61b13;margin:.5rem 0 0;min-height:1.25rem}
button{margin-top:1.25rem;width:100%;font:inherit;font-weight:600;padding:.85rem;border:0;border-radius:.75rem;background:#c6f36b;color:#111;cursor:pointer}
button[disabled]{opacity:.6;cursor:default}
[hidden]{display:none!important}
@media (prefers-color-scheme:dark){body{background:#111;color:#eee}input{background:#1d1f1c;border-color:#444;color:#eee}.hint{color:#aaa}.error{color:#ff8a80}}
</style></head>
<body><main>
<h1 id="title">Choose a new password</h1>
<div id="form-area">
<p>Choose a new password for your Pulseform account. You will be signed out of your other devices.</p>
<form id="form" novalidate>
<label for="password">New password</label>
<input id="password" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD_LENGTH}" maxlength="${MAX_PASSWORD_LENGTH}">
<p class="hint">${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.</p>
<label for="confirm">Repeat the new password</label>
<input id="confirm" type="password" autocomplete="new-password" maxlength="${MAX_PASSWORD_LENGTH}">
<p class="error" id="error" role="alert"></p>
<button id="submit" type="submit">Change password</button>
</form>
</div>
<p id="done" hidden>Your password was changed. Go back to the Pulseform app and sign in with your new password.</p>
<div id="invalid" hidden>
<p>This link has expired, was already used, or isn't valid. Open the Pulseform app, choose Sign in, then "Forgot your password?" to get a new link. Links work once, for ${PASSWORD_RESET_MINUTES} minutes.</p>
</div>
<script nonce="${nonce}">
(function () {
  var token = new URLSearchParams(location.search).get('token') || '';
  history.replaceState(null, '', location.pathname);
  var $ = function (id) { return document.getElementById(id); };
  function show(id) { ['form-area', 'done', 'invalid'].forEach(function (x) { $(x).hidden = x !== id; }); $('title').textContent = id === 'done' ? 'Password changed' : id === 'invalid' ? 'Link not valid' : 'Choose a new password'; }
  if (!token) { show('invalid'); return; }
  function fail(message, field) { $('error').textContent = message; $('password').removeAttribute('aria-invalid'); $('confirm').removeAttribute('aria-invalid'); if (field) { $(field).setAttribute('aria-invalid', 'true'); $(field).focus(); } }
  $('form').addEventListener('submit', function (event) {
    event.preventDefault();
    var password = $('password').value;
    if (password.length < ${MIN_PASSWORD_LENGTH}) { return fail('Use at least ${MIN_PASSWORD_LENGTH} characters.', 'password'); }
    if (password.length > ${MAX_PASSWORD_LENGTH}) { return fail('Use at most ${MAX_PASSWORD_LENGTH} characters.', 'password'); }
    if (password !== $('confirm').value) { return fail("The two passwords don't match.", 'confirm'); }
    fail('');
    $('submit').disabled = true;
    $('submit').textContent = 'Changing password…';
    fetch('/api/auth/reset-password', { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: token, newPassword: password }) })
      .then(function (response) {
        if (response.ok) { token = ''; $('password').value = ''; $('confirm').value = ''; return show('done'); }
        return response.json().catch(function () { return {}; }).then(function (body) {
          if (response.status === 429) { fail('Too many attempts. Wait a minute and try again.'); }
          else if (body.code === 'INVALID_TOKEN') { show('invalid'); }
          else if (body.code === 'PASSWORD_TOO_SHORT' || body.code === 'PASSWORD_TOO_LONG') { fail('Use ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.', 'password'); }
          else { fail("Something went wrong. Try again in a moment."); }
        });
      })
      .catch(function () { fail("Couldn't reach Pulseform. Check your connection and try again."); })
      .then(function () { $('submit').disabled = false; $('submit').textContent = 'Change password'; });
  });
})();
</script>
</main></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    },
  });
}

const publicUser = (user: { id: string; email: string; name: string; emailVerified: boolean }) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  emailVerified: user.emailVerified,
});
