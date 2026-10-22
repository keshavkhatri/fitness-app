import { TestBed } from '@angular/core/testing';
import { AUTH_API_BASE_URL, AUTH_FETCH, AuthApi } from './auth-api';
import { APP_AUTH_CALLBACK, AUTH_PLATFORM, AuthService } from './auth.service';
import { challengeFor } from './pkce';
import { MemorySecretStore, SECRET_STORE } from './session-store';
import { API, TOKEN, USER, confirmationSent, fakeAuthBackend, fakePlatform, json, signedIn } from './testing/fake-auth-backend';

function setup(routes: Parameters<typeof fakeAuthBackend>[0] = {}, { native = true, base = API as string | null, launch = null as string | null } = {}) {
  const backend = fakeAuthBackend(routes);
  const store = new MemorySecretStore();
  const fake = fakePlatform(native);
  fake.platform.launch = launch;
  TestBed.configureTestingModule({
    providers: [
      { provide: AUTH_FETCH, useValue: backend.fetch },
      { provide: AUTH_API_BASE_URL, useValue: base },
      { provide: SECRET_STORE, useValue: store },
      { provide: AUTH_PLATFORM, useValue: fake.platform },
    ],
  });
  return { auth: TestBed.inject(AuthService), api: TestBed.inject(AuthApi), backend, store, ...fake };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('AuthApi', () => {
  it('signs in with JSON, no cookies, and keeps only the minimum user fields', async () => {
    const { api, backend } = setup({ 'POST /api/auth/sign-in/email': signedIn });
    const result = await api.signIn('alex@example.test', 'correct horse battery');
    expect(result).toEqual({ ok: true, value: { token: TOKEN, user: USER } });
    expect(backend.calls[0]).toMatchObject({ method: 'POST', credentials: 'omit', body: { email: 'alex@example.test', password: 'correct horse battery' } });
    expect(backend.calls[0].headers['authorization']).toBeUndefined();
  });

  it.each([
    [json(401, { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }), 'invalid-credentials'],
    [json(422, { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' }), 'email-taken'],
    [json(400, { code: 'PASSWORD_TOO_SHORT' }), 'weak-password'],
    [json(400, { code: 'INVALID_EMAIL' }), 'invalid-email'],
    [json(403, { code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' }), 'email-not-verified'],
    [json(429, {}), 'rate-limited'],
    [json(503, { error: { code: 'auth-not-configured' } }), 'not-configured'],
    [json(500, { message: 'database password=hunter2 failed' }), 'unavailable'],
  ])('maps a failed answer to a safe error code (%#)', async (response, error) => {
    const { api } = setup({ 'POST /api/auth/sign-up/email': () => response });
    expect(await api.signUp('Alex', 'alex@example.test', 'correct horse battery')).toEqual({ ok: false, error });
  });

  it('asks for a password-reset link with the address only, and treats any 200 the same', async () => {
    const { api, backend } = setup({ 'POST /api/auth/request-password-reset': () => json(200, { status: true }) });
    expect(await api.requestPasswordReset('alex@example.test')).toEqual({ ok: true, value: undefined });
    expect(backend.calls[0]).toMatchObject({ method: 'POST', credentials: 'omit', body: { email: 'alex@example.test' } });
    expect(backend.calls[0].headers['authorization']).toBeUndefined();
  });

  it.each([
    [json(429, {}), 'rate-limited'],
    [json(400, { code: 'RESET_PASSWORD_DISABLED', message: "Reset password isn't enabled" }), 'not-configured'],
    [json(503, { error: { code: 'auth-not-configured' } }), 'not-configured'],
    [json(500, { message: 'boom' }), 'unavailable'],
  ])('maps a failed reset request to a safe error code (%#)', async (response, error) => {
    const { api } = setup({ 'POST /api/auth/request-password-reset': () => response });
    expect(await api.requestPasswordReset('alex@example.test')).toEqual({ ok: false, error });
  });

  it('a reset request never signs anyone in or stores anything', async () => {
    const { auth, store } = setup({ 'POST /api/auth/request-password-reset': () => json(200, { status: true }) });
    await auth.restore();
    expect(await auth.requestPasswordReset(' alex@example.test ')).toEqual({ ok: true, value: undefined });
    expect(auth.state()).toEqual({ status: 'guest' });
    expect(store.values.size).toBe(0);
  });

  it('reports network failures and a build without an API', async () => {
    const offline = setup({ 'POST /api/auth/sign-in/email': () => Promise.reject(new TypeError('Failed to fetch')) });
    expect(await offline.api.signIn('a@example.test', 'x')).toEqual({ ok: false, error: 'network' });
    TestBed.resetTestingModule();
    const none = setup({}, { base: null });
    expect(none.api.available).toBe(false);
    expect(await none.api.signIn('a@example.test', 'x')).toEqual({ ok: false, error: 'not-configured' });
  });

  it('asks who the token belongs to with a Bearer header; 401 means signed out', async () => {
    let status = 200;
    const { api, backend } = setup({ 'GET /v1/auth/me': () => (status === 200 ? json(200, { user: USER, session: {} }) : json(401, {})) });
    expect(await api.me(TOKEN)).toEqual({ ok: true, value: USER });
    expect(backend.calls[0].headers['authorization']).toBe(`Bearer ${TOKEN}`);
    status = 401;
    expect(await api.me(TOKEN)).toEqual({ ok: true, value: null });
  });
});

describe('AuthService', () => {
  describe('restoring the session at launch', () => {
    it('without a stored session: guest, and no request is made', async () => {
      const { auth, backend } = setup();
      await auth.restore();
      expect(auth.state()).toEqual({ status: 'guest' });
      expect(backend.calls).toEqual([]);
    });

    it('with a valid stored session: signed in and confirmed by the server', async () => {
      const { auth, store } = setup({ 'GET /v1/auth/me': () => json(200, { user: { ...USER, name: 'Alex M' } }) });
      await store.set('session', JSON.stringify({ token: TOKEN, user: USER }));
      await auth.restore();
      expect(auth.state()).toEqual({ status: 'signed-in', user: { ...USER, name: 'Alex M' }, verified: true });
    });

    it('a session the server rejected is forgotten', async () => {
      const { auth, store } = setup({ 'GET /v1/auth/me': () => json(401, {}) });
      await store.set('session', JSON.stringify({ token: TOKEN, user: USER }));
      await auth.restore();
      expect(auth.state()).toEqual({ status: 'guest' });
      expect(store.values.has('session')).toBe(false);
    });

    it('offline: the account stays, marked unverified (the person is not signed out by a bad connection)', async () => {
      const { auth, store } = setup({ 'GET /v1/auth/me': () => Promise.reject(new TypeError('offline')) });
      await store.set('session', JSON.stringify({ token: TOKEN, user: USER }));
      await auth.restore();
      expect(auth.state()).toEqual({ status: 'signed-in', user: USER, verified: false });
      expect(store.values.has('session')).toBe(true);
    });
  });

  it('signing in keeps the token in the secret store only: never localStorage, never app state', async () => {
    localStorage.clear();
    const { auth, store } = setup({ 'POST /api/auth/sign-in/email': signedIn });
    const result = await auth.signIn('  alex@example.test ', 'correct horse battery');
    expect(result).toEqual({ ok: true, value: USER });
    expect(JSON.parse(store.values.get('session')!)).toEqual({ token: TOKEN, user: USER });
    expect(JSON.stringify(auth.state())).not.toContain(TOKEN);
    expect(Object.keys(localStorage)).toEqual([]);
    expect(await auth.token()).toBe(TOKEN);
  });

  it('sign-up with email verification: no session, nothing stored, still a guest until the address is confirmed', async () => {
    const { auth, api, store } = setup({ 'POST /api/auth/sign-up/email': confirmationSent });
    await auth.restore();
    expect(await api.signUp('Alex', 'alex@example.test', 'correct horse battery')).toEqual({ ok: true, value: null });
    expect(await auth.signUp('Alex', 'alex@example.test', 'correct horse battery')).toEqual({ ok: true, value: null });
    expect(auth.state()).toEqual({ status: 'guest' });
    expect(store.values.size).toBe(0);
  });

  it('signing in before confirming the address is refused (the server sends a new link) and stores nothing', async () => {
    const { auth, store } = setup({ 'POST /api/auth/sign-in/email': () => json(403, { code: 'EMAIL_NOT_VERIFIED' }) });
    await auth.restore();
    expect(await auth.signIn('alex@example.test', 'correct horse battery')).toEqual({ ok: false, error: 'email-not-verified' });
    expect(store.values.size).toBe(0);
    expect(auth.state()).toEqual({ status: 'guest' });
  });

  it('a sign-in answer without a token is not treated as signed in', async () => {
    const { auth, store } = setup({ 'POST /api/auth/sign-in/email': confirmationSent });
    expect(await auth.signIn('alex@example.test', 'correct horse battery')).toEqual({ ok: false, error: 'unavailable' });
    expect(store.values.size).toBe(0);
  });

  it('a failed sign-in stores nothing and stays a guest', async () => {
    const { auth, store } = setup({ 'POST /api/auth/sign-in/email': () => json(401, {}) });
    await auth.restore();
    expect(await auth.signIn('alex@example.test', 'wrong')).toEqual({ ok: false, error: 'invalid-credentials' });
    expect(store.values.size).toBe(0);
    expect(auth.state()).toEqual({ status: 'guest' });
  });

  it("signing out ends the session on the server and here, and leaves the app's local data alone", async () => {
    localStorage.setItem('fitness.profile', '{"version":2}');
    localStorage.setItem('fitness.workout-logs', '{"version":1,"logs":[]}');
    const { auth, store, backend } = setup({ 'POST /api/auth/sign-in/email': signedIn, 'POST /api/auth/sign-out': () => json(200, { success: true }) });
    await auth.signIn('alex@example.test', 'correct horse battery');
    await auth.signOut();
    expect(auth.state()).toEqual({ status: 'guest' });
    expect(store.values.has('session')).toBe(false);
    expect(backend.calls.at(-1)).toMatchObject({ method: 'POST', path: '/api/auth/sign-out', headers: { authorization: `Bearer ${TOKEN}` } });
    expect(localStorage.getItem('fitness.profile')).toBe('{"version":2}');
    expect(localStorage.getItem('fitness.workout-logs')).toBe('{"version":1,"logs":[]}');
    localStorage.clear();
  });

  it('changing the account name sends it with the Bearer token and updates the signed-in user', async () => {
    const { auth, backend, store } = setup({ 'POST /api/auth/sign-in/email': signedIn, 'POST /api/auth/update-user': () => json(200, { status: true }) });
    await auth.signIn('alex@example.test', 'correct horse battery');
    expect(await auth.updateName('Sam')).toEqual({ ok: true, value: { ...USER, name: 'Sam' } });
    expect(backend.calls.at(-1)).toMatchObject({ method: 'POST', path: '/api/auth/update-user', body: { name: 'Sam' }, headers: { authorization: `Bearer ${TOKEN}` } });
    expect(auth.user()?.name).toBe('Sam');
    expect(JSON.parse(store.values.get('session')!).user.name).toBe('Sam');
  });

  it('a name change that fails, or without a session, changes nothing', async () => {
    const { auth, backend, store } = setup({ 'POST /api/auth/sign-in/email': signedIn, 'POST /api/auth/update-user': () => json(401, {}) });
    expect(await auth.updateName('Sam')).toEqual({ ok: false, error: 'invalid-credentials' });
    expect(backend.calls).toHaveLength(0);
    await auth.signIn('alex@example.test', 'correct horse battery');
    expect((await auth.updateName('Sam')).ok).toBe(false);
    expect(auth.user()?.name).toBe(USER.name);
    expect(JSON.parse(store.values.get('session')!).user.name).toBe(USER.name);
  });

  it('deleting the account sends the confirmation with the Bearer token, then forgets the session here', async () => {
    const { auth, backend, store } = setup({ 'POST /api/auth/sign-in/email': signedIn, 'POST /v1/account/delete': () => new Response(null, { status: 204 }) });
    await auth.signIn('alex@example.test', 'correct horse battery');
    expect(await auth.deleteAccount()).toEqual({ ok: true, value: undefined });
    expect(backend.calls.at(-1)).toMatchObject({ method: 'POST', path: '/v1/account/delete', body: { confirm: 'DELETE' }, headers: { authorization: `Bearer ${TOKEN}` } });
    expect(auth.state()).toEqual({ status: 'guest' });
    expect(store.values.has('session')).toBe(false);
  });

  it('a deletion the server refused (or without a session) keeps the account signed in', async () => {
    const { auth, backend, store } = setup({ 'POST /api/auth/sign-in/email': signedIn, 'POST /v1/account/delete': () => json(503, {}) });
    expect(await auth.deleteAccount()).toEqual({ ok: false, error: 'invalid-credentials' });
    expect(backend.calls).toHaveLength(0);
    await auth.signIn('alex@example.test', 'correct horse battery');
    expect(await auth.deleteAccount()).toEqual({ ok: false, error: 'unavailable' });
    expect(auth.state().status).toBe('signed-in');
    expect(store.values.has('session')).toBe(true);
  });

  it('signing out still works offline (the token is forgotten locally)', async () => {
    const { auth, store } = setup({ 'POST /api/auth/sign-in/email': signedIn, 'POST /api/auth/sign-out': () => Promise.reject(new TypeError('offline')) });
    await auth.signIn('alex@example.test', 'correct horse battery');
    await auth.signOut();
    expect(auth.state()).toEqual({ status: 'guest' });
    expect(store.values.size).toBe(0);
  });

  describe('Google on Android', () => {
    it('opens the system browser with the deep link and the verifier challenge, keeping the verifier secret', async () => {
      const { auth, platform, store } = setup();
      expect(await auth.startGoogle()).toEqual({ ok: true, value: undefined });
      const url = new URL(platform.opened[0]);
      expect(url.origin + url.pathname).toBe(`${API}/v1/auth/google/start`);
      expect(url.searchParams.get('redirect')).toBe(APP_AUTH_CALLBACK);
      const { verifier } = JSON.parse(store.values.get('google-verifier')!) as { verifier: string };
      expect(url.searchParams.get('challenge')).toBe(await challengeFor(verifier));
      expect(platform.opened[0]).not.toContain(verifier);
      expect(auth.googlePending()).toBe(true);
    });

    it('finishes from the deep link: closes the browser, redeems the code with the verifier, signs in', async () => {
      const { auth, platform, store, deepLink, backend } = setup({
        'POST /v1/auth/mobile/exchange': () => json(200, { token: TOKEN, user: USER, session: {} }),
      });
      await auth.startGoogle();
      const { verifier } = JSON.parse(store.values.get('google-verifier')!) as { verifier: string };
      deepLink(`${APP_AUTH_CALLBACK}?code=one-time-code`);
      await flush();
      await flush();
      expect(platform.closes).toBe(1);
      expect(backend.calls.at(-1)).toMatchObject({ path: '/v1/auth/mobile/exchange', body: { code: 'one-time-code', verifier } });
      expect(auth.state()).toEqual({ status: 'signed-in', user: USER, verified: true });
      expect(store.values.has('google-verifier')).toBe(false);
      expect(auth.googlePending()).toBe(false);
    });

    it('reports a failed or cancelled Google sign-in without signing in', async () => {
      const { auth, deepLink, browserClosed } = setup();
      await auth.startGoogle();
      deepLink(`${APP_AUTH_CALLBACK}?error=google-sign-in-failed`);
      await flush();
      expect(auth.googleError()).toBe('google-failed');
      expect(auth.state().status).not.toBe('signed-in');

      await auth.startGoogle();
      browserClosed();
      expect(auth.googlePending()).toBe(false);
    });

    it('explains why Google could not sign in when the server says so', async () => {
      const { auth, deepLink } = setup();
      await auth.startGoogle();
      deepLink(`${APP_AUTH_CALLBACK}?error=account-not-linked`);
      await flush();
      expect(auth.googleError()).toBe('account-not-linked');
      await auth.startGoogle();
      deepLink(`${APP_AUTH_CALLBACK}?error=email-not-verified`);
      await flush();
      expect(auth.googleError()).toBe('email-not-verified');
      await auth.startGoogle();
      deepLink(`${APP_AUTH_CALLBACK}?error=${encodeURIComponent('<b>made up</b>')}`);
      await flush();
      expect(auth.googleError()).toBe('google-failed');
    });

    it('finishes when Android restarted the app from the deep link (cold start), exactly once', async () => {
      const verifier = 'v'.repeat(43);
      const link = `${APP_AUTH_CALLBACK}?code=cold-code`;
      const ctx = setup({ 'POST /v1/auth/mobile/exchange': () => json(200, { token: TOKEN, user: USER }) }, { launch: link });
      // The verifier saved before Android closed the app (secure storage outlives the process).
      await ctx.store.set('google-verifier', JSON.stringify({ verifier, at: Date.now() }));
      ctx.deepLink(link); // the same link may also arrive as an event
      await flush();
      await flush();
      expect(ctx.backend.calls.filter((c) => c.path === '/v1/auth/mobile/exchange')).toHaveLength(1);
      expect(ctx.auth.state()).toEqual({ status: 'signed-in', user: USER, verified: true });
      expect(ctx.auth.googleError()).toBeNull();
    });

    it('a damaged saved verifier is treated as an expired sign-in, not a crash', async () => {
      const { auth, store, backend } = setup();
      await store.set('google-verifier', '{not json');
      expect(await auth.completeGoogle('code')).toEqual({ ok: false, error: 'code-expired' });
      expect(backend.calls).toEqual([]);
    });

    it('ignores deep links that are not the sign-in callback', async () => {
      const { auth, platform, deepLink } = setup();
      deepLink('com.stokeformfitness.app://somewhere-else?code=x');
      await flush();
      expect(platform.closes).toBe(0);
      expect(auth.googleError()).toBeNull();
    });

    it('a code without a started sign-in (no verifier here) is refused locally', async () => {
      const { auth, backend } = setup();
      expect(await auth.completeGoogle('code')).toEqual({ ok: false, error: 'code-expired' });
      expect(backend.calls).toEqual([]);
    });
  });

  it('Google on the web redirects this page, returning to /auth/callback', async () => {
    const { auth, platform } = setup({}, { native: false });
    await auth.startGoogle();
    expect(platform.opened).toEqual([]);
    expect(new URL(platform.navigated[0]).searchParams.get('redirect')).toBe('http://localhost:4200/auth/callback');
  });
});
