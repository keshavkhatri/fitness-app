import type { PGlite } from '@electric-sql/pglite';
import { getMigrations } from 'better-auth/db/migration';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SAMPLE_INBODY380_EXTRACTION } from '../../src/app/domain/inbody-extraction/testing/sample-inbody380-extraction';
import { createAppHandler } from '../src/app-handler';
import { createAuth } from '../src/auth/auth';
import { AuthConfig } from '../src/auth/auth-config';
import { createAuthRoutes } from '../src/auth/auth-routes';
import { EmailSender, VerificationMessage } from '../src/auth/email';
import { challengeOf, createHandoffStore } from '../src/auth/mobile-handoff';
import { migrateUp } from '../src/db/migrations';
import { LogFields, createExtractionHandler } from '../src/extraction-handler';
import { loadMigrations } from '../tools/migration-files';
import { APP_ORIGIN, CONTEXT, FakeResponsesClient, completed, config as serverConfig, outputText, pngBytes, upload } from './fixtures';
import { MIGRATIONS_DIRECTORY, newDatabase, pglitePool, sqlClient } from './pglite';

// Real Better Auth on a real PostgreSQL engine (PGlite, in process) with the repository's migrations.
// No network: emails go to an in-memory outbox, and the only Google piece replaced is its token
// endpoint (see "Google identities"), so Better Auth's real callback and linking rules run.
// Placeholder secrets only.
const BASE = 'http://localhost:8787';
const APP_REDIRECT = 'com.stokeformfitness.app://auth/callback';
const SECRET = 'test-only-Zq7v2Lr9Wm4Kt8Ns1Xc6Bp3Hd5Jf0Ge';
const GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const authConfig = ({ google = false, email = true } = {}): AuthConfig => ({
  secret: SECRET,
  baseUrl: BASE,
  google: google ? { clientId: GOOGLE_CLIENT_ID, clientSecret: 'test-google-secret' } : null,
  email: email ? { kind: 'dev-outbox', directory: 'unused-in-tests' } : null,
  appRedirectUrls: [APP_REDIRECT],
  sessionDays: 30,
});
const PASSWORD = 'correct horse battery';

let db: PGlite;
const logs: { event: string; fields?: LogFields }[] = [];
const log = (event: string, fields?: LogFields) => logs.push({ event, fields });
const outbox: VerificationMessage[] = [];
const resets: VerificationMessage[] = [];
const sender: EmailSender = {
  kind: 'dev-outbox',
  sendVerification: async (message) => (outbox.push(message), { ok: true }),
  sendPasswordReset: async (message) => (resets.push(message), { ok: true }),
  sendTest: async () => ({ ok: true }),
};

function build({ google = false, email = true, pool = pglitePool(db) as never, rateLimit = false, clientIpHeader = null as string | null } = {}) {
  const config = authConfig({ google, email });
  const auth = createAuth({ config, pool, trustedOrigins: [APP_ORIGIN], clientIpHeader, email: email ? sender : null, log, rateLimit });
  const handoffs = createHandoffStore(3 * 60_000);
  const routes = createAuthRoutes({ auth, config, allowedOrigins: [APP_ORIGIN], handoffs, log });
  const extraction = createExtractionHandler({
    config: serverConfig(),
    client: new FakeResponsesClient({ ok: true, body: completed(outputText(JSON.stringify(SAMPLE_INBODY380_EXTRACTION))) }),
    log,
    readiness: async () => true,
  });
  return { auth, routes, handle: createAppHandler({ extraction, authRoutes: routes }) };
}

let app: ReturnType<typeof build>;
beforeAll(async () => {
  db = await newDatabase();
  await migrateUp(sqlClient(db), await loadMigrations(MIGRATIONS_DIRECTORY));
  app = build();
}, 60_000);

type Handle = ReturnType<typeof build>['handle'];
const post = (path: string, body: unknown, headers: Record<string, string> = {}, handle: Handle = app.handle) =>
  handle(new Request(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: APP_ORIGIN, ...headers }, body: JSON.stringify(body) }), CONTEXT);
const get = (path: string, headers: Record<string, string> = {}, handle: Handle = app.handle) => handle(new Request(`${BASE}${path}`, { headers }), CONTEXT);
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const cookiesOf = (response: Response) => response.headers.getSetCookie().map((c) => c.split(';')[0]);
let n = 0;
const email = () => `person${++n}@example.test`;
const userRow = async (address: string) =>
  (await db.query<{ id: string; emailVerified: boolean }>('SELECT id, "emailVerified" FROM auth."user" WHERE email = $1', [address])).rows[0];
const mailTo = (address: string) => outbox.filter((m) => m.to === address);

async function signUp(address = email(), password = PASSWORD, extra: Record<string, unknown> = {}) {
  const response = await post('/api/auth/sign-up/email', { name: 'Test Person', email: address, password, ...extra });
  return { response, email: address };
}
const signIn = (address: string, password = PASSWORD) => post('/api/auth/sign-in/email', { email: address, password });

/** Opens the newest confirmation link sent to the address, as the person's browser would. */
async function confirm(address: string) {
  const link = mailTo(address).at(-1)!.url;
  expect(link.startsWith(`${BASE}/`)).toBe(true);
  return app.handle(new Request(link), CONTEXT);
}

/** A confirmed email/password account, signed in: its bearer token and its browser cookies. */
async function verifiedUser(address = email()) {
  await signUp(address);
  await confirm(address);
  const response = await signIn(address);
  expect(response.status).toBe(200);
  return { email: address, token: response.headers.get('set-auth-token')!, cookie: cookiesOf(response).join('; '), id: (await userRow(address)).id };
}

describe('the schema Better Auth expects', () => {
  it('is exactly what migration 0006 created: Better Auth would add nothing', async () => {
    const plan = await getMigrations(app.auth.options);
    expect(plan.toBeCreated).toEqual([]);
    expect(plan.toBeAdded).toEqual([]);
    expect(plan.toBeAddedIndexes).toEqual([]);
    expect(plan.unsafeChanges).toEqual([]);
    expect(plan.schemaProblems).toEqual([]);
  });

  it('keeps its tables in the auth schema, not public', async () => {
    const { response } = await signUp();
    expect(response.status).toBe(200);
    expect((await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'")).rows).toEqual([{ n: 0 }]);
    expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM auth."user"')).rows[0].n).toBeGreaterThan(0);
  });
});

describe('email verification', () => {
  it('sign-up creates an unconfirmed account and emails a link, but gives no session', async () => {
    const { response, email: address } = await signUp();
    expect(response.status).toBe(200);
    expect(response.headers.get('set-auth-token')).toBeNull();
    expect(cookiesOf(response).some((c) => c.includes('session_token'))).toBe(false);
    expect(((await response.json()) as { token: unknown }).token).toBeNull();
    expect(await userRow(address)).toMatchObject({ emailVerified: false });
    const mail = mailTo(address);
    expect(mail).toHaveLength(1);
    const link = new URL(mail[0].url);
    expect(link.origin + link.pathname).toBe(`${BASE}/api/auth/verify-email`);
    expect(link.searchParams.get('callbackURL')).toBe(`${BASE}/v1/auth/email-verified`);
  });

  it('the link always lands on this server, whatever callbackURL the client asked for', async () => {
    const address = email();
    const response = await signUp(address, PASSWORD, { callbackURL: 'https://evil.example/phish' });
    if (response.response.status === 200) {
      expect(new URL(mailTo(address)[0].url).searchParams.get('callbackURL')).toBe(`${BASE}/v1/auth/email-verified`);
    } else {
      expect(mailTo(address)).toEqual([]);
    }
  });

  it('an unconfirmed account cannot sign in, even with the right password; it gets a fresh link instead', async () => {
    const { email: address } = await signUp();
    const response = await signIn(address);
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe('EMAIL_NOT_VERIFIED');
    expect(response.headers.get('set-auth-token')).toBeNull();
    expect(mailTo(address)).toHaveLength(2);
    // A wrong password neither signs in nor sends anything.
    expect((await signIn(address, 'not the password')).status).toBe(401);
    expect(mailTo(address)).toHaveLength(2);
  });

  it('opening the link confirms the address (without making a browser session); then sign-in works', async () => {
    const { email: address } = await signUp();
    const opened = await confirm(address);
    expect(opened.status).toBe(302);
    expect(opened.headers.get('location')).toBe(`${BASE}/v1/auth/email-verified`);
    expect(cookiesOf(opened).some((c) => c.includes('session_token'))).toBe(false);
    expect(await userRow(address)).toMatchObject({ emailVerified: true });

    const page = await get('/v1/auth/email-verified');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(await page.text()).toContain('Email confirmed');

    const response = await signIn(address);
    expect(response.status).toBe(200);
    const token = response.headers.get('set-auth-token')!;
    expect(token).toMatch(/^[^.]+\.[^.]+$/); // token.signature
    const me = (await (await get('/v1/auth/me', bearer(token))).json()) as { user: { email: string; emailVerified: boolean } };
    expect(me.user).toMatchObject({ email: address, emailVerified: true });
  });

  it('a tampered or expired link confirms nothing and says so without echoing anything', async () => {
    const { email: address } = await signUp();
    const link = new URL(mailTo(address)[0].url);
    link.searchParams.set('token', `${link.searchParams.get('token')!.slice(0, -4)}abcd`);
    const opened = await app.handle(new Request(link), CONTEXT);
    expect(opened.headers.get('location')).toBe(`${BASE}/v1/auth/email-verified?error=INVALID_TOKEN`);
    expect(await userRow(address)).toMatchObject({ emailVerified: false });
    const page = await get('/v1/auth/email-verified?error=INVALID_TOKEN');
    expect(page.status).toBe(400);
    expect(await page.text()).toContain("This link isn't valid");
    const injected = await (await get('/v1/auth/email-verified?error=%3Cscript%3Ealert(1)%3C/script%3E')).text();
    expect(injected).not.toContain('<script>');
    expect(await (await get('/v1/auth/email-verified?error=TOKEN_EXPIRED')).text()).toContain('expired');
  });

  it('the public "send me a link" route is closed (a link is only re-sent after the right password)', async () => {
    const { email: address } = await signUp();
    const response = await post('/api/auth/send-verification-email', { email: address });
    expect(response.status).toBe(404);
    expect(mailTo(address)).toHaveLength(1);
  });

  it('a session whose address is not confirmed is not an identity', async () => {
    const user = await verifiedUser();
    expect((await get('/v1/auth/me', bearer(user.token))).status).toBe(200);
    await db.query('UPDATE auth."user" SET "emailVerified" = false WHERE id = $1', [user.id]);
    expect((await get('/v1/auth/me', bearer(user.token))).status).toBe(401);
    expect(await app.routes.authenticate(new Request(`${BASE}/v1/auth/me`, { headers: bearer(user.token) }))).toBeNull();
  });

  it('a second sign-up with a taken address answers like a new one, but creates and sends nothing', async () => {
    const user = await verifiedUser();
    const sent = outbox.length;
    const again = await post('/api/auth/sign-up/email', { name: 'Someone', email: user.email, password: 'another password!' });
    expect(again.status).toBe(200);
    expect(again.headers.get('set-auth-token')).toBeNull();
    expect(outbox.length).toBe(sent);
    expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM auth."user" WHERE email = $1', [user.email])).rows[0].n).toBe(1);
    expect((await signIn(user.email, 'another password!')).status).toBe(401);
    expect((await signIn(user.email)).status).toBe(200);
  });

  it('without email delivery, email/password accounts are off (nothing unconfirmed can be created)', async () => {
    const off = build({ email: false, google: true });
    expect(await (await get('/v1/auth/providers', {}, off.handle)).json()).toEqual({ accounts: true, emailPassword: false, google: true });
    const address = email();
    const response = await post('/api/auth/sign-up/email', { name: 'A', email: address, password: PASSWORD }, {}, off.handle);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(await userRow(address)).toBeUndefined();
    // And with neither email nor Google, the app is told accounts are unavailable.
    const none = build({ email: false });
    expect(await (await get('/v1/auth/providers', {}, none.handle)).json()).toEqual({ accounts: false, emailPassword: false, google: false });
  });
});

describe('password reset', () => {
  const NEW_PASSWORD = 'a brand new passphrase';
  const resetMail = (address: string) => resets.filter((m) => m.to === address);
  const tokenOf = (address: string) => new URL(resetMail(address).at(-1)!.url).searchParams.get('token')!;
  const requestReset = (address: string, handle: Handle = app.handle) => post('/api/auth/request-password-reset', { email: address }, {}, handle);
  // The "choose a new password" page posts from the server's own origin.
  const resetWith = (token: string, newPassword: string, origin = BASE) => post('/api/auth/reset-password', { token, newPassword }, { origin });
  const codeOf = async (response: Response) => ((await response.json()) as { code?: string }).code;

  it('emails a link to the server-hosted page, with a token, and answers "check your email"', async () => {
    const { email: address } = await verifiedUser();
    const response = await requestReset(address);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: true, message: 'If this email exists in our system, check your email for the reset link' });
    const mail = resetMail(address);
    expect(mail).toHaveLength(1);
    const link = new URL(mail[0].url);
    expect(link.origin + link.pathname).toBe(`${BASE}/v1/auth/reset-password`);
    expect(tokenOf(address)).toMatch(/^[A-Za-z0-9]{20,}$/);
  });

  it('answers an unknown address exactly like a known one, and sends nothing', async () => {
    const { email: known } = await verifiedUser();
    const sent = resets.length;
    const a = await requestReset(known);
    const b = await requestReset('nobody-at-all@example.test');
    expect(b.status).toBe(a.status);
    expect(await b.text()).toBe(await a.text());
    expect(resets.length).toBe(sent + 1); // only the known address was emailed
    expect(resetMail('nobody-at-all@example.test')).toEqual([]);
  });

  it("ignores a client-supplied redirect: the link always goes to this server's page", async () => {
    const { email: address } = await verifiedUser();
    await post('/api/auth/request-password-reset', { email: address, redirectTo: `${APP_ORIGIN}/evil` });
    expect(resetMail(address).at(-1)!.url.startsWith(`${BASE}/v1/auth/reset-password?token=`)).toBe(true);
    expect(resetMail(address).at(-1)!.url).not.toContain('evil');
  });

  it('serves a static page that never echoes the URL, locked down by a per-response nonce', async () => {
    const one = await get('/v1/auth/reset-password?token=SECRET-TOKEN-VALUE&x=%3Cscript%3E');
    const html = await one.text();
    expect(one.status).toBe(200);
    expect(one.headers.get('content-type')).toContain('text/html');
    expect(one.headers.get('cache-control')).toBe('no-store');
    expect(one.headers.get('referrer-policy')).toBe('no-referrer');
    expect(html).toContain('Choose a new password');
    expect(html).not.toContain('SECRET-TOKEN-VALUE');
    expect(html).not.toContain('<script>alert');
    const csp = one.headers.get('content-security-policy')!;
    const nonce = /script-src 'nonce-([^']+)'/.exec(csp)![1];
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(html).toContain(`<script nonce="${nonce}">`);
    // The script removes the token from the address bar at once and posts to the reset endpoint.
    expect(html).toContain('history.replaceState');
    expect(html).toContain('/api/auth/reset-password');
    const two = await get('/v1/auth/reset-password');
    expect(/script-src 'nonce-([^']+)'/.exec(two.headers.get('content-security-policy')!)![1]).not.toBe(nonce);
  });

  it('Better Auth’s own link route (token in the path, then a redirect) is closed', async () => {
    const response = await get(`/api/auth/reset-password/sometoken?callbackURL=${encodeURIComponent(`${APP_ORIGIN}/x`)}`);
    expect(response.status).toBe(404);
  });

  it('changes the password with a valid link: the old password stops working, the new one works', async () => {
    const { email: address } = await verifiedUser();
    await requestReset(address);
    const response = await resetWith(tokenOf(address), NEW_PASSWORD);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: true });
    expect((await signIn(address, PASSWORD)).status).toBe(401);
    expect((await signIn(address, NEW_PASSWORD)).status).toBe(200);
  });

  it('ends every existing session of the account, on every device', async () => {
    const phone = await verifiedUser();
    const laptop = (await signIn(phone.email)).headers.get('set-auth-token')!;
    const other = await verifiedUser(); // someone else: unaffected
    expect((await get('/v1/auth/me', bearer(phone.token))).status).toBe(200);
    expect((await get('/v1/auth/me', bearer(laptop))).status).toBe(200);
    await requestReset(phone.email);
    expect((await resetWith(tokenOf(phone.email), NEW_PASSWORD)).status).toBe(200);
    expect((await get('/v1/auth/me', bearer(phone.token))).status).toBe(401);
    expect((await get('/v1/auth/me', bearer(laptop))).status).toBe(401);
    expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM auth.session WHERE "userId" = $1', [phone.id])).rows[0].n).toBe(0);
    expect((await get('/v1/auth/me', bearer(other.token))).status).toBe(200);
  });

  it('a link works once: reusing it fails and changes nothing', async () => {
    const { email: address } = await verifiedUser();
    await requestReset(address);
    const token = tokenOf(address);
    expect((await resetWith(token, NEW_PASSWORD)).status).toBe(200);
    const again = await resetWith(token, 'a different passphrase!');
    expect(again.status).toBe(400);
    expect(await codeOf(again)).toBe('INVALID_TOKEN');
    expect((await signIn(address, 'a different passphrase!')).status).toBe(401);
    expect((await signIn(address, NEW_PASSWORD)).status).toBe(200);
  });

  it('an expired link fails, and so does one that never existed', async () => {
    const { email: address } = await verifiedUser();
    await requestReset(address);
    const token = tokenOf(address);
    await db.query(`UPDATE auth.verification SET "expiresAt" = now() - interval '1 minute' WHERE identifier = $1`, [`reset-password:${token}`]);
    const expired = await resetWith(token, NEW_PASSWORD);
    expect(expired.status).toBe(400);
    expect(await codeOf(expired)).toBe('INVALID_TOKEN');
    for (const bad of ['not-a-real-token', 'x'.repeat(24), '']) {
      const response = await resetWith(bad, NEW_PASSWORD);
      expect(response.status, bad).toBe(400);
      expect(await codeOf(response)).toBe('INVALID_TOKEN');
    }
    expect((await signIn(address, PASSWORD)).status).toBe(200); // unchanged
  });

  it('a link lasts one hour', async () => {
    const { email: address } = await verifiedUser();
    await requestReset(address);
    const { rows } = await db.query<{ minutes: number }>(
      `SELECT extract(epoch from ("expiresAt" - now())) / 60 AS minutes FROM auth.verification WHERE identifier = $1`,
      [`reset-password:${tokenOf(address)}`],
    );
    expect(Number(rows[0].minutes)).toBeGreaterThan(59);
    expect(Number(rows[0].minutes)).toBeLessThanOrEqual(60);
  });

  it('a too-short or too-long new password is refused without using up the link', async () => {
    const { email: address } = await verifiedUser();
    await requestReset(address);
    const token = tokenOf(address);
    expect(await codeOf(await resetWith(token, 'short'))).toBe('PASSWORD_TOO_SHORT');
    expect(await codeOf(await resetWith(token, 'x'.repeat(129)))).toBe('PASSWORD_TOO_LONG');
    expect((await signIn(address, PASSWORD)).status).toBe(200);
    expect((await resetWith(token, NEW_PASSWORD)).status).toBe(200); // the same link still works
  });

  it('an account whose email was never confirmed can reset its password, but still cannot sign in until it confirms', async () => {
    const { email: address } = await signUp(email(), 'attacker password!');
    await requestReset(address);
    expect(resetMail(address)).toHaveLength(1);
    expect((await resetWith(tokenOf(address), NEW_PASSWORD)).status).toBe(200);
    // The address's real owner now holds the only password; the squatter's no longer works.
    expect((await signIn(address, 'attacker password!')).status).toBe(401);
    expect((await signIn(address, NEW_PASSWORD)).status).toBe(403);
    expect(await userRow(address)).toMatchObject({ emailVerified: false });
  });

  it('a Google-only account can add a password through its own mailbox', async () => {
    const address = email();
    await db.query(`INSERT INTO auth."user" (id, name, email, "emailVerified", "updatedAt") VALUES ('g-only', 'G', $1, true, now())`, [address]);
    await db.query(`INSERT INTO auth.account (id, "accountId", "providerId", "userId", "updatedAt") VALUES ('g-only-acc', 'sub', 'google', 'g-only', now())`);
    await requestReset(address);
    expect((await resetWith(tokenOf(address), NEW_PASSWORD)).status).toBe(200);
    expect((await signIn(address, NEW_PASSWORD)).status).toBe(200);
    expect((await db.query<{ p: string }>(`SELECT "providerId" AS p FROM auth.account WHERE "userId" = 'g-only' ORDER BY 1`)).rows.map((r) => r.p)).toEqual(['credential', 'google']);
  });

  it('refuses the reset request or the new password from an origin that is neither the app nor this server', async () => {
    const { email: address } = await verifiedUser();
    expect((await post('/api/auth/request-password-reset', { email: address }, { origin: 'https://evil.example' })).status).toBe(403);
    await requestReset(address);
    expect((await resetWith(tokenOf(address), NEW_PASSWORD, 'https://evil.example')).status).toBe(403);
    expect((await signIn(address, PASSWORD)).status).toBe(200);
  });

  it('is rate limited: a few requests a minute, then 429', async () => {
    const limited = build({ rateLimit: true });
    const { email: address } = await verifiedUser();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await requestReset(address, limited.handle)).status);
    }
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });

  it('is off without email delivery (nothing to send a link with)', async () => {
    const off = build({ email: false, google: true });
    const response = await requestReset('anyone@example.test', off.handle);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(resetMail('anyone@example.test')).toEqual([]);
  });

  it('never logs the link, the token, an address or a password', async () => {
    const before = logs.length;
    const { email: address } = await verifiedUser();
    await requestReset(address);
    const token = tokenOf(address);
    await resetWith(token, NEW_PASSWORD);
    await resetWith(token, 'reuse attempt passphrase');
    const written = JSON.stringify(logs.slice(before));
    for (const secret of [token, NEW_PASSWORD, 'reuse attempt passphrase', address, resetMail(address)[0].url]) {
      expect(written).not.toContain(secret);
    }
    expect(logs.slice(before).some((l) => l.event === 'auth.password-reset')).toBe(true);
  });
});

describe('email and password', () => {
  it('stores only a salted hash of the password', async () => {
    const { email: address } = await signUp();
    const { rows } = await db.query<{ password: string }>(
      'SELECT a.password FROM auth.account a JOIN auth."user" u ON u.id = a."userId" WHERE u.email = $1 AND a."providerId" = $2',
      [address, 'credential'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].password).not.toContain(PASSWORD);
    expect(rows[0].password.length).toBeGreaterThan(40);
  });

  it('refuses a wrong password and an unknown address the same way', async () => {
    const { email: address } = await verifiedUser();
    const wrong = await signIn(address, 'not the password');
    const unknown = await signIn('nobody@example.test', 'not the password');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.headers.get('set-auth-token')).toBeNull();
    expect(((await wrong.json()) as { message: string }).message).toBe(((await unknown.json()) as { message: string }).message);
  });

  it.each([
    ['a password under 8 characters', { name: 'A', email: 'short@example.test', password: 'short' }],
    ['a password over 128 characters', { name: 'A', email: 'long@example.test', password: 'x'.repeat(129) }],
    ['an invalid email', { name: 'A', email: 'not-an-email', password: PASSWORD }],
  ])('rejects %s, without creating the account', async (_, body) => {
    const response = await post('/api/auth/sign-up/email', body);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(response.headers.get('set-auth-token')).toBeNull();
    expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM auth."user" WHERE email = $1', [body.email])).rows[0].n).toBe(0);
    expect(mailTo(body.email)).toEqual([]);
  });
});

describe('GET /v1/auth/me', () => {
  it('is 401 without a session, with a Bearer challenge', async () => {
    const response = await get('/v1/auth/me');
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    expect(await response.json()).toEqual({ error: { code: 'unauthenticated', message: 'Sign in to continue.' } });
  });

  it('returns only the minimum identity for a valid session', async () => {
    const { token, email: address } = await verifiedUser();
    const response = await get('/v1/auth/me', bearer(token));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: Record<string, unknown>; session: Record<string, unknown> };
    expect(Object.keys(body.user).sort()).toEqual(['email', 'emailVerified', 'id', 'name']);
    expect(body.user['email']).toBe(address);
    expect(Object.keys(body.session)).toEqual(['expiresAt']);
    expect(JSON.stringify(body)).not.toContain(token.split('.')[0]);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('takes the identity from the verified session, never from a user id the caller supplies', async () => {
    const victim = await verifiedUser();
    const attacker = await verifiedUser();
    const response = await get(`/v1/auth/me?user_id=${victim.id}&userId=${victim.id}`, { ...bearer(attacker.token), 'x-user-id': victim.id });
    const body = (await response.json()) as { user: { id: string; email: string } };
    expect(body.user.email).toBe(attacker.email);
    expect(body.user.id).not.toBe(victim.id);
    // A user id alone is not a credential.
    expect((await get('/v1/auth/me', bearer(victim.id))).status).toBe(401);
  });

  it('refuses the raw session id from the database: tokens must carry the server signature', async () => {
    const { token } = await verifiedUser();
    const raw = token.split('.')[0];
    expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM auth.session WHERE token = $1', [raw])).rows[0].n).toBe(1);
    expect((await get('/v1/auth/me', bearer(raw))).status).toBe(401);
    expect((await get('/v1/auth/me', bearer(`${raw}.forged-signature`))).status).toBe(401);
  });

  it('ignores user ids in the body of other methods too (only GET answers)', async () => {
    const { token } = await verifiedUser();
    expect((await post('/v1/auth/me', { userId: 'someone-else' }, bearer(token))).status).toBe(405);
  });
});

describe('POST /api/auth/update-user (the app saves the display name here)', () => {
  it('changes the name of the bearer session\'s own account, and /v1/auth/me then returns it', async () => {
    const { token, id } = await verifiedUser();
    const response = await post('/api/auth/update-user', { name: 'Sam Rivera' }, bearer(token));
    expect(response.status).toBe(200);
    const me = (await (await get('/v1/auth/me', bearer(token))).json()) as { user: { name: string } };
    expect(me.user.name).toBe('Sam Rivera');
    const row = await db.query<{ name: string }>('SELECT name FROM auth."user" WHERE id = $1', [id]);
    expect(row.rows[0]?.name).toBe('Sam Rivera');
  });

  it('is refused without a session, and changes nothing', async () => {
    const { email: address } = await verifiedUser();
    const response = await post('/api/auth/update-user', { name: 'Nobody' });
    expect(response.status).toBe(401);
    const row = await db.query<{ name: string }>('SELECT name FROM auth."user" WHERE email = $1', [address]);
    expect(row.rows[0]?.name).toBe('Test Person');
  });

  it("only ever changes the caller's own account, whatever user id the request names", async () => {
    const victim = await verifiedUser();
    const attacker = await verifiedUser();
    const response = await post('/api/auth/update-user', { name: 'Mallory', userId: victim.id, id: victim.id }, { ...bearer(attacker.token), 'x-user-id': victim.id });
    expect(response.status).toBe(200);
    const names = await db.query<{ id: string; name: string }>('SELECT id, name FROM auth."user" WHERE id = ANY($1)', [[victim.id, attacker.id]]);
    expect(names.rows.find((r) => r.id === victim.id)?.name).toBe('Test Person');
    expect(names.rows.find((r) => r.id === attacker.id)?.name).toBe('Mallory');
  });

  it('cannot be used to change the address or mark it confirmed', async () => {
    const { token, email: address, id } = await verifiedUser();
    const other = email();
    await post('/api/auth/update-user', { name: 'Sam', email: other, emailVerified: false });
    await post('/api/auth/update-user', { name: 'Sam', email: other, emailVerified: false }, bearer(token));
    const row = await db.query<{ email: string; emailVerified: boolean }>('SELECT email, "emailVerified" FROM auth."user" WHERE id = $1', [id]);
    expect(row.rows[0]).toEqual({ email: address, emailVerified: true });
  });
});

describe('sessions', () => {
  it('logout ends the session on the server', async () => {
    const { token } = await verifiedUser();
    expect((await get('/v1/auth/me', bearer(token))).status).toBe(200);
    const out = await post('/api/auth/sign-out', {}, bearer(token));
    expect(out.status).toBe(200);
    expect((await get('/v1/auth/me', bearer(token))).status).toBe(401);
  });

  it('signing out on one device leaves the other signed in', async () => {
    const phone = await verifiedUser();
    const laptop = (await signIn(phone.email)).headers.get('set-auth-token')!;
    await post('/api/auth/sign-out', {}, bearer(phone.token));
    expect((await get('/v1/auth/me', bearer(phone.token))).status).toBe(401);
    expect((await get('/v1/auth/me', bearer(laptop))).status).toBe(200);
  });

  it('an expired session is refused', async () => {
    const { token } = await verifiedUser();
    await db.query(`UPDATE auth.session SET "expiresAt" = now() - interval '1 minute' WHERE token = $1`, [token.split('.')[0]]);
    expect((await get('/v1/auth/me', bearer(token))).status).toBe(401);
  });

  it('a new session lasts the configured 30 days', async () => {
    const { token } = await verifiedUser();
    const body = (await (await get('/v1/auth/me', bearer(token))).json()) as { session: { expiresAt: string } };
    const days = (Date.parse(body.session.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
  });

  it('a deleted account loses its sessions and its StokeForm data', async () => {
    const { token, id } = await verifiedUser();
    await db.query(`INSERT INTO stokeform.weight_entries (user_id, id, date, weight_kg, created_at, updated_at) VALUES ($1, 'w1', '2026-10-15', 80, now(), now())`, [id]);
    await db.query('DELETE FROM auth."user" WHERE id = $1', [id]);
    expect((await get('/v1/auth/me', bearer(token))).status).toBe(401);
    expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM stokeform.weight_entries WHERE user_id = $1', [id])).rows[0].n).toBe(0);
  });
});

const verifier = 'v'.repeat(20) + 'erifier-0123456789-abcdefghijklmn';
const challenge = challengeOf(verifier);
const handoffQuery = `redirect=${encodeURIComponent(APP_REDIRECT)}&challenge=${challenge}`;
const start = (handle: Handle = app.handle, params = handoffQuery) => get(`/v1/auth/google/start?${params}`, {}, handle);

describe('Google sign-in', () => {
  it('reports which sign-in methods are available, without anything secret', async () => {
    expect(await (await get('/v1/auth/providers')).json()).toEqual({ accounts: true, emailPassword: true, google: false });
    const google = build({ google: true });
    const body = await (await get('/v1/auth/providers', {}, google.handle)).text();
    expect(JSON.parse(body)).toEqual({ accounts: true, emailPassword: true, google: true });
    expect(body).not.toMatch(/test-client-id|test-google-secret/);
  });

  it('without credentials: the server runs, and Google answers a clear, safe 503', async () => {
    const response = await start();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: 'google-not-configured', message: "Google sign-in isn't available right now." } });
  });

  it('refuses a return address that is not on the allowlist, and a malformed challenge', async () => {
    expect((await start(app.handle, `redirect=${encodeURIComponent('https://evil.example/cb')}&challenge=${challenge}`)).status).toBe(400);
    expect((await start(app.handle, `redirect=${encodeURIComponent(APP_REDIRECT)}&challenge=short`)).status).toBe(400);
  });

  it('with credentials: redirects the browser to Google with this server as the redirect URI and a state cookie', async () => {
    const google = build({ google: true });
    const response = await start(google.handle);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('client_id')).toBe(GOOGLE_CLIENT_ID);
    expect(location.searchParams.get('redirect_uri')).toBe(`${BASE}/api/auth/callback/google`);
    expect(location.searchParams.get('state')).toBeTruthy();
    expect(location.searchParams.get('code_challenge')).toBeTruthy(); // Better Auth's own PKCE with Google
    expect(location.toString()).not.toContain('test-google-secret');
    expect(response.headers.getSetCookie().join(';')).toMatch(/state/);
  });

  describe('hand-off to the app (exercised with an email session in place of Google)', () => {
    const complete = (cookie: string, params = handoffQuery) => get(`/v1/auth/google/complete?${params}`, cookie ? { cookie } : {});
    const codeFrom = (response: Response) => new URL(response.headers.get('location')!).searchParams.get('code');

    it('sends a single-use code to the app deep link, which only the original verifier can redeem', async () => {
      const done = await complete((await verifiedUser()).cookie);
      expect(done.status).toBe(302);
      expect(done.headers.get('location')).toMatch(/^com\.stokeformfitness\.app:\/\/auth\/callback\?code=/);
      const code = codeFrom(done)!;

      const wrong = await post('/v1/auth/mobile/exchange', { code, verifier: 'w'.repeat(43) });
      expect(wrong.status).toBe(400);
      // Single use: the failed attempt burned the code, so even the right verifier can't use it now.
      expect((await post('/v1/auth/mobile/exchange', { code, verifier })).status).toBe(400);

      const second = codeFrom(await complete((await verifiedUser()).cookie))!;
      const ok = await post('/v1/auth/mobile/exchange', { code: second, verifier });
      expect(ok.status).toBe(200);
      const body = (await ok.json()) as { token: string; user: { email: string } };
      expect(body.token).toMatch(/^[^.]+\.[^.]+$/);
      expect((await get('/v1/auth/me', bearer(body.token))).status).toBe(200);
      expect((await post('/v1/auth/mobile/exchange', { code: second, verifier })).status).toBe(400);
    });

    it('sends the app an error, not a code, when there is no session or Google reported an error', async () => {
      const none = await complete('');
      expect(none.headers.get('location')).toBe(`${APP_REDIRECT}?error=google-sign-in-failed`);
      const user = await verifiedUser();
      const failed = await complete(user.cookie, `${handoffQuery}&failed=1&error=access_denied`);
      expect(failed.headers.get('location')).toBe(`${APP_REDIRECT}?error=google-sign-in-failed`);
      const notLinked = await complete(user.cookie, `${handoffQuery}&failed=1&error=account_not_linked`);
      expect(notLinked.headers.get('location')).toBe(`${APP_REDIRECT}?error=account-not-linked`);
      const odd = await complete(user.cookie, `${handoffQuery}&failed=1&error=${encodeURIComponent('<b>x</b>')}`);
      expect(odd.headers.get('location')).toBe(`${APP_REDIRECT}?error=google-sign-in-failed`);
    });

    it("keeps Better Auth's own one-time-token routes closed: codes go through the verifier check only", async () => {
      expect((await post('/api/auth/one-time-token/verify', { token: 'anything' })).status).toBe(404);
      expect((await get('/api/auth/one-time-token/generate')).status).toBe(404);
    });
  });
});

describe('Google identities and account linking', () => {
  // Better Auth's real Google callback runs; only Google's token endpoint is answered locally, with
  // an ID token carrying the claims under test. The identity comes from that server-to-server
  // answer, never from anything the app or the browser sends.
  let google: ReturnType<typeof build>;
  beforeAll(() => {
    google = build({ google: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  function googleAnswers(claims: { sub: string; email: string; email_verified: boolean }) {
    const now = Math.floor(Date.now() / 1000);
    const idToken = `${b64({ alg: 'RS256', typ: 'JWT', kid: 'test' })}.${b64({ iss: 'https://accounts.google.com', aud: GOOGLE_CLIENT_ID, iat: now, exp: now + 3600, name: 'Google Person', ...claims })}.sig`;
    const real = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) =>
      String(input instanceof Request ? input.url : input).startsWith('https://oauth2.googleapis.com/token')
        ? new Response(JSON.stringify({ access_token: 'test-access', id_token: idToken, expires_in: 3600, token_type: 'Bearer', scope: 'openid email profile' }), {
            headers: { 'content-type': 'application/json' },
          })
        : real(input, init),
    );
  }

  /** The whole browser leg: start, Google's redirect back to the callback, then the hand-off. Returns where the app is sent. */
  async function signInWithGoogle(claims: { sub: string; email: string; email_verified: boolean }, extraStartParams = '') {
    googleAnswers(claims);
    const started = await start(google.handle, `${handoffQuery}${extraStartParams}`);
    const state = new URL(started.headers.get('location')!).searchParams.get('state')!;
    let cookie = cookiesOf(started).join('; ');
    const callback = await get(`/api/auth/callback/google?code=test-code&state=${encodeURIComponent(state)}`, { cookie }, google.handle);
    expect(callback.status).toBe(302);
    cookie = [cookie, ...cookiesOf(callback)].join('; ');
    const next = new URL(callback.headers.get('location')!);
    expect(next.origin + next.pathname).toBe(`${BASE}/v1/auth/google/complete`);
    const done = await get(next.pathname + next.search, { cookie }, google.handle);
    expect(done.status).toBe(302);
    return new URL(done.headers.get('location')!);
  }
  const accountsOf = async (userId: string) =>
    (await db.query<{ providerId: string }>('SELECT "providerId" FROM auth.account WHERE "userId" = $1 ORDER BY "providerId"', [userId])).rows.map((r) => r.providerId);
  async function exchange(location: URL) {
    const response = await post('/v1/auth/mobile/exchange', { code: location.searchParams.get('code'), verifier }, {}, google.handle);
    expect(response.status).toBe(200);
    return ((await response.json()) as { token: string }).token;
  }

  it('the earlier takeover: a password account squatting an unconfirmed address is never joined to the real owner\'s Google identity', async () => {
    const victim = email();
    // The attacker registers the victim's address with a password they know. It stays unconfirmed.
    await signUp(victim, 'attacker password!');
    const squat = await userRow(victim);
    // The real owner signs in with Google, which reports the address as verified. A user-supplied
    // email on the start URL is ignored (the identity comes only from Google's answer).
    const landed = await signInWithGoogle({ sub: 'google-victim', email: victim, email_verified: true }, `&email=${encodeURIComponent('other@example.test')}`);
    expect(landed.searchParams.get('error')).toBe('account-not-linked');
    expect(landed.searchParams.has('code')).toBe(false);
    // Nothing was joined or confirmed, and the attacker's password still opens nothing.
    expect(await accountsOf(squat.id)).toEqual(['credential']);
    expect(await userRow(victim)).toMatchObject({ emailVerified: false });
    expect((await signIn(victim, 'attacker password!')).status).toBe(403);
    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM auth.session WHERE "userId" = $1`, [squat.id])).rows[0].n).toBe(0);
  });

  it('a confirmed password account and a verified Google identity with the same address become one account', async () => {
    const user = await verifiedUser();
    const landed = await signInWithGoogle({ sub: 'google-linked', email: user.email, email_verified: true });
    expect(landed.searchParams.has('code')).toBe(true);
    const token = await exchange(landed);
    const me = (await (await get('/v1/auth/me', bearer(token))).json()) as { user: { id: string } };
    expect(me.user.id).toBe(user.id);
    expect(await accountsOf(user.id)).toEqual(['credential', 'google']);
  });

  it('a Google identity whose address Google has not verified is never joined to an existing account', async () => {
    const user = await verifiedUser();
    const landed = await signInWithGoogle({ sub: 'google-unverified-match', email: user.email, email_verified: false });
    expect(landed.searchParams.get('error')).toBe('account-not-linked');
    expect(await accountsOf(user.id)).toEqual(['credential']);
  });

  it('a new Google identity with an unverified address gets no session', async () => {
    const address = email();
    const landed = await signInWithGoogle({ sub: 'google-unverified-new', email: address, email_verified: false });
    expect(landed.searchParams.get('error')).toBe('email-not-verified');
    expect(landed.searchParams.has('code')).toBe(false);
    const row = await userRow(address);
    if (row) {
      expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM auth.session WHERE "userId" = $1`, [row.id])).rows[0].n).toBe(0);
    }
  });

  it('a new, verified Google identity becomes a confirmed account and signs in', async () => {
    const address = email();
    const landed = await signInWithGoogle({ sub: 'google-new', email: address, email_verified: true });
    const token = await exchange(landed);
    const me = (await (await get('/v1/auth/me', bearer(token))).json()) as { user: { email: string; emailVerified: boolean } };
    expect(me.user).toEqual(expect.objectContaining({ email: address, emailVerified: true }));
    // The same Google identity signs straight back in to the same account.
    const again = await signInWithGoogle({ sub: 'google-new', email: address, email_verified: true });
    expect(again.searchParams.has('code')).toBe(true);
  });

  it('linking rules are configured explicitly, not left to library defaults', () => {
    expect(google.auth.options.account?.accountLinking).toMatchObject({ enabled: true, trustedProviders: [], requireLocalEmailVerified: true, allowDifferentEmails: false });
    expect(google.auth.options.emailAndPassword).toMatchObject({ requireEmailVerification: true, autoSignIn: false });
    expect(google.auth.options.emailVerification).toMatchObject({ autoSignInAfterVerification: false });
  });
});

describe('behind Cloud Run: what a caller cannot change', () => {
  it('a spoofed Host or forwarded host never moves the links in emails: they always use BETTER_AUTH_URL', async () => {
    const address = email();
    const request = new Request('http://evil.example:9999/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: APP_ORIGIN, 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ name: 'Spoof', email: address, password: PASSWORD, callbackURL: 'https://evil.example/x' }),
    });
    expect((await app.handle(request, CONTEXT)).status).toBe(200);
    expect(mailTo(address)[0].url.startsWith(`${BASE}/api/auth/verify-email?`)).toBe(true);
    expect(mailTo(address)[0].url).not.toContain('evil');
    const reset = new Request('http://evil.example:9999/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: APP_ORIGIN, 'x-forwarded-host': 'evil.example' },
      body: JSON.stringify({ email: address, redirectTo: 'https://evil.example/reset' }),
    });
    await app.handle(reset, CONTEXT);
    expect(resets.filter((m) => m.to === address).at(-1)!.url.startsWith(`${BASE}/v1/auth/reset-password?token=`)).toBe(true);
  });

  describe('rate limits and X-Forwarded-For (Cloud Run appends the real client address at the end)', () => {
    const attempt = (handle: Handle, forwarded: string) => post('/api/auth/sign-in/email', { email: 'nobody@example.test', password: 'not the password' }, { 'x-forwarded-for': forwarded }, handle).then((r) => r.status);
    const limited = () => build({ rateLimit: true, clientIpHeader: 'x-forwarded-for' });

    it('different real clients do not throttle each other; one client is limited after 5 sign-in attempts a minute', async () => {
      const { handle } = limited();
      for (let n = 1; n <= 8; n++) {
        expect(await attempt(handle, `203.0.113.${n}`), `client ${n}`).toBe(401);
      }
      const statuses: number[] = [];
      for (let i = 0; i < 7; i++) {
        statuses.push(await attempt(handle, '198.51.100.7'));
      }
      expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(statuses.slice(5)).toEqual([429, 429]);
    });

    it('forging the start of the header does not escape the limit: such requests share one strict bucket', async () => {
      const { handle } = limited();
      const statuses: number[] = [];
      for (let n = 1; n <= 8; n++) {
        statuses.push(await attempt(handle, `10.9.9.${n}, 198.51.100.8`));
      }
      expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(statuses.slice(5)).toEqual([429, 429, 429]);
      // ...and honest clients are unaffected by the forger's bucket.
      expect(await attempt(handle, '203.0.113.200')).toBe(401);
    });
  });
});

describe('origins', () => {
  it('answers the preflight for the app origin, allowing the Authorization header', async () => {
    const response = await app.handle(new Request(`${BASE}/v1/auth/me`, { method: 'OPTIONS', headers: { origin: APP_ORIGIN, 'access-control-request-method': 'GET' } }), CONTEXT);
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-headers')).toContain('Authorization');
  });

  it('refuses sign-in from an origin that is not the app', async () => {
    const { email: address } = await verifiedUser();
    const response = await post('/api/auth/sign-in/email', { email: address, password: PASSWORD }, { origin: 'https://evil.example' });
    expect(response.status).toBe(403);
    expect(response.headers.get('set-auth-token')).toBeNull();
  });
});

describe('failures stay generic', () => {
  const brokenPool = {
    connect: async () => {
      throw Object.assign(new Error('connect ECONNREFUSED: postgresql://neondb_owner:p4ssw0rd-secret@ep-db.neon.tech/neondb'), { code: 'ECONNREFUSED' });
    },
    end: async () => undefined,
  };

  it('a database failure answers 503 with no detail, and nothing secret reaches the logs', async () => {
    const broken = build({ pool: brokenPool as never });
    const before = logs.length;
    const me = await broken.handle(new Request(`${BASE}/v1/auth/me`, { headers: bearer('abc.def') }), CONTEXT);
    expect(me.status).toBe(503);
    expect(await me.text()).toBe('{"error":{"code":"auth-unavailable","message":"Accounts aren\'t available right now. Try again later."}}');
    const signInBroken = await broken.handle(
      new Request(`${BASE}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: APP_ORIGIN }, body: JSON.stringify({ email: 'a@example.test', password: PASSWORD }) }),
      CONTEXT,
    );
    expect(signInBroken.status).toBeGreaterThanOrEqual(500);
    const text = await signInBroken.text();
    expect(text).not.toMatch(/p4ssw0rd|neondb_owner|ECONNREFUSED|ep-db/);
    expect(JSON.stringify(logs.slice(before))).not.toMatch(/p4ssw0rd|neondb_owner|ep-db\.neon/);
  });

  it('never logs a password, a session token, a confirmation link or an address', async () => {
    const before = logs.length;
    const user = await verifiedUser();
    await signIn(user.email, 'not the password');
    await get('/v1/auth/me', bearer(user.token));
    const written = JSON.stringify(logs.slice(before));
    expect(written).not.toContain(PASSWORD);
    expect(written).not.toContain(user.token.split('.')[0]);
    expect(written).not.toContain(user.email);
    expect(written).not.toContain(new URL(mailTo(user.email)[0].url).searchParams.get('token')!);
  });

  it('with accounts not configured, every account route answers 503 and nothing else changes', async () => {
    const routes = createAuthRoutes({ auth: null, config: null, allowedOrigins: [APP_ORIGIN], handoffs: createHandoffStore(1000), log });
    const handle = createAppHandler({ extraction: createExtractionHandler({ config: serverConfig(), client: null, log }), authRoutes: routes });
    expect(await (await get('/v1/auth/providers', {}, handle)).json()).toEqual({ accounts: false, emailPassword: false, google: false });
    for (const path of ['/v1/auth/me', '/api/auth/sign-in/email', '/v1/auth/google/start', '/v1/auth/email-verified']) {
      const response = await get(path, {}, handle);
      expect(response.status, path).toBe(503);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe('auth-not-configured');
    }
    expect((await get('/health', {}, handle)).status).toBe(200);
  });
});

describe('existing endpoints are unchanged behind the new router', () => {
  it('/health, /ready and InBody extraction still answer as before', async () => {
    expect(await (await get('/health')).json()).toEqual({ status: 'ok' });
    expect(await (await get('/ready')).json()).toEqual({ status: 'ready' });
    const extraction = await app.handle(upload(pngBytes()), CONTEXT);
    expect(extraction.status).toBe(200);
    expect(((await extraction.json()) as { schemaVersion: string }).schemaVersion).toBe('inbody-extraction.v1');
    expect((await get('/v1/unknown')).status).toBe(404);
  });
});
