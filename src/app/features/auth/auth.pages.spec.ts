import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, convertToParamMap, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';
import { AUTH_API_BASE_URL, AUTH_FETCH } from '../../core/auth/auth-api';
import { redirectIfSignedIn, requireSignedIn } from '../../core/auth/auth.guards';
import { APP_AUTH_CALLBACK, AUTH_PLATFORM, AuthService } from '../../core/auth/auth.service';
import { MemorySecretStore, SECRET_STORE } from '../../core/auth/session-store';
import { API, TOKEN, USER, confirmationSent, fakeAuthBackend, fakePlatform, json, signedIn } from '../../core/auth/testing/fake-auth-backend';
import { AccountCardComponent } from '../you/account-card.component';
import { AccountFormPage } from './account-form.page';
import { ForgotPasswordPage } from './forgot-password.page';
import { AUTH_ERRORS, FIELD_ERRORS, safeNext, validateAuthForm } from './auth-content';
import { AuthCallbackPage } from './auth-callback.page';

const providersOk = (google = true, emailPassword = true) => () => json(200, { accounts: emailPassword || google, emailPassword, google });
const flush = async (fixture?: ComponentFixture<unknown>) => {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 0));
    fixture?.detectChanges();
  }
};

function setup(routes: Parameters<typeof fakeAuthBackend>[0] = {}, { native = true, query = {} as Record<string, string> } = {}) {
  const backend = fakeAuthBackend(routes);
  const store = new MemorySecretStore();
  const fake = fakePlatform(native);
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      { provide: AUTH_FETCH, useValue: backend.fetch },
      { provide: AUTH_API_BASE_URL, useValue: API },
      { provide: SECRET_STORE, useValue: store },
      { provide: AUTH_PLATFORM, useValue: fake.platform },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  const nav = TestBed.inject(NavController);
  return {
    backend,
    store,
    ...fake,
    auth: TestBed.inject(AuthService),
    back: vi.spyOn(nav, 'navigateBack').mockResolvedValue(true),
    forward: vi.spyOn(nav, 'navigateForward').mockResolvedValue(true),
    root: vi.spyOn(nav, 'navigateRoot').mockResolvedValue(true),
  };
}

const q = (fixture: ComponentFixture<unknown>, id: string) => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(`[data-testid="${id}"]`);
function type(fixture: ComponentFixture<unknown>, field: string, value: string) {
  const input = q(fixture, `field-${field}`)!.querySelector('input')!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}
function submit(fixture: ComponentFixture<unknown>) {
  q(fixture, 'auth-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
}

describe('validateAuthForm and safeNext', () => {
  it('requires the right fields for each mode', () => {
    expect(validateAuthForm({ name: '', email: '', password: '' }, 'sign-in')).toEqual({ email: FIELD_ERRORS.emailRequired, password: FIELD_ERRORS.passwordRequired });
    expect(validateAuthForm({ name: ' ', email: 'not-an-email', password: 'short' }, 'sign-up')).toEqual({
      name: FIELD_ERRORS.nameRequired,
      email: FIELD_ERRORS.emailInvalid,
      password: FIELD_ERRORS.passwordTooShort,
    });
    // A short password is only refused on sign-up; sign-in lets the server decide.
    expect(validateAuthForm({ name: '', email: 'a@b.co', password: 'short' }, 'sign-in')).toEqual({});
    expect(validateAuthForm({ name: 'A', email: 'a@b.co', password: 'x'.repeat(129) }, 'sign-up')).toEqual({ password: FIELD_ERRORS.passwordTooLong });
  });

  it('only returns to in-app paths after signing in', () => {
    expect(safeNext('/you/profile', '/you')).toBe('/you/profile');
    for (const unsafe of ['https://evil.test', '//evil.test', 'javascript:alert(1)', '/x?u=http://evil', '', null, undefined]) {
      expect(safeNext(unsafe, '/you')).toBe('/you');
    }
  });
});

describe('auth guards', () => {
  const run = (guard: typeof requireSignedIn, url = '/backup') =>
    TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)) as Promise<boolean | UrlTree>;

  it('guests are sent to sign-in (with a way back) only from screens that need an account', async () => {
    setup();
    const result = await run(requireSignedIn);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/auth/sign-in?next=%2Fbackup');
    expect(await run(redirectIfSignedIn)).toBe(true);
  });

  it('a signed-in person skips the sign-in screens', async () => {
    const { store } = setup({ 'GET /v1/auth/me': () => json(200, { user: USER }) });
    await store.set('session', JSON.stringify({ token: TOKEN, user: USER }));
    expect(await run(requireSignedIn)).toBe(true);
    expect(TestBed.inject(Router).serializeUrl((await run(redirectIfSignedIn)) as UrlTree)).toBe('/you');
  });
});

describe('AccountFormPage', () => {
  async function open(mode: 'sign-in' | 'sign-up', routes: Parameters<typeof fakeAuthBackend>[0], next?: string) {
    const ctx = setup({ 'GET /v1/auth/providers': providersOk(), ...routes });
    await ctx.auth.restore();
    const fixture = TestBed.createComponent(AccountFormPage);
    (fixture.componentRef as ComponentRef<AccountFormPage>).setInput('mode', mode);
    if (next) {
      fixture.componentRef.setInput('next', next);
    }
    fixture.detectChanges();
    await flush(fixture);
    return { ...ctx, fixture };
  }

  it('sign-in: checks the fields before sending anything', async () => {
    const { fixture, backend } = await open('sign-in', {});
    expect(q(fixture, 'auth-title')!.textContent).toContain('Sign in');
    expect(q(fixture, 'field-name')).toBeNull();
    expect(q(fixture, 'local-data')!.textContent).toContain('Nothing is uploaded unless you turn on cloud backup');
    submit(fixture);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(FIELD_ERRORS.emailRequired);
    expect(fixture.nativeElement.textContent).toContain(FIELD_ERRORS.passwordRequired);
    expect(backend.calls.filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('sign-in: wrong password shows a plain error and stays on the screen', async () => {
    const { fixture, back } = await open('sign-in', { 'POST /api/auth/sign-in/email': () => json(401, { code: 'INVALID_EMAIL_OR_PASSWORD' }) });
    type(fixture, 'email', 'alex@example.test');
    type(fixture, 'password', 'wrong password');
    submit(fixture);
    await flush(fixture);
    expect(q(fixture, 'auth-error')!.textContent).toContain(AUTH_ERRORS['invalid-credentials'].title);
    expect(back).not.toHaveBeenCalled();
  });

  it('sign-in: success returns to the requested in-app screen', async () => {
    const { fixture, back, auth } = await open('sign-in', { 'POST /api/auth/sign-in/email': signedIn }, '/you/profile');
    type(fixture, 'email', 'alex@example.test');
    type(fixture, 'password', 'correct horse battery');
    submit(fixture);
    await flush(fixture);
    expect(auth.state().status).toBe('signed-in');
    expect(back).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledWith('/you/profile');
  });

  it('sign-up: asks for a name, creates the account, and asks the person to confirm their email (not signed in yet)', async () => {
    const { fixture, back, forward, backend, auth } = await open('sign-up', { 'POST /api/auth/sign-up/email': confirmationSent });
    expect(q(fixture, 'auth-title')!.textContent).toContain('Create your account');
    type(fixture, 'name', 'Alex');
    type(fixture, 'email', 'alex@example.test');
    type(fixture, 'password', 'correct horse battery');
    submit(fixture);
    await flush(fixture);
    expect(backend.calls.at(-1)).toMatchObject({ path: '/api/auth/sign-up/email', body: { name: 'Alex', email: 'alex@example.test' } });
    expect(q(fixture, 'check-email')!.textContent).toContain('alex@example.test');
    expect(q(fixture, 'auth-form')).toBeNull();
    expect(auth.state()).toEqual({ status: 'guest' });
    expect(back).not.toHaveBeenCalled();
    q(fixture, 'check-email-sign-in')!.click();
    expect(forward).toHaveBeenCalledWith('/auth/sign-in', { replaceUrl: true, queryParams: {} });
  });

  it('sign-in before confirming the email explains what to do', async () => {
    const { fixture, back } = await open('sign-in', { 'POST /api/auth/sign-in/email': () => json(403, { code: 'EMAIL_NOT_VERIFIED' }) });
    type(fixture, 'email', 'alex@example.test');
    type(fixture, 'password', 'correct horse battery');
    submit(fixture);
    await flush(fixture);
    expect(q(fixture, 'auth-error')!.textContent).toContain(AUTH_ERRORS['email-not-verified'].title);
    expect(back).not.toHaveBeenCalled();
  });

  it('Google only (the server has no email delivery): no password form, just Google', async () => {
    setup({ 'GET /v1/auth/providers': providersOk(true, false) });
    const fixture = TestBed.createComponent(AccountFormPage);
    fixture.detectChanges();
    await flush(fixture);
    expect(q(fixture, 'auth-form')).toBeNull();
    expect(q(fixture, 'auth-switch')).toBeNull();
    expect(q(fixture, 'auth-google')).not.toBeNull();
    expect(q(fixture, 'accounts-unavailable')).toBeNull();
  });

  it('sign-up: an email already in use is explained', async () => {
    const { fixture } = await open('sign-up', { 'POST /api/auth/sign-up/email': () => json(422, { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' }) });
    type(fixture, 'name', 'Alex');
    type(fixture, 'email', 'alex@example.test');
    type(fixture, 'password', 'correct horse battery');
    submit(fixture);
    await flush(fixture);
    expect(q(fixture, 'auth-error')!.textContent).toContain(AUTH_ERRORS['email-taken'].title);
  });

  it('offers Google only when the server has it set up, and finishes when the deep link arrives', async () => {
    const { fixture, platform, deepLink, back } = await open('sign-in', { 'POST /v1/auth/mobile/exchange': () => json(200, { token: TOKEN, user: USER }) });
    q(fixture, 'auth-google')!.click();
    await flush(fixture);
    expect(platform.opened).toHaveLength(1);
    expect(q(fixture, 'google-pending')).not.toBeNull();
    deepLink(`${APP_AUTH_CALLBACK}?code=c`);
    await flush(fixture);
    expect(back).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledWith('/you');
  });

  it('hides Google when it is not configured', async () => {
    setup({ 'GET /v1/auth/providers': providersOk(false) });
    const fixture = TestBed.createComponent(AccountFormPage);
    fixture.detectChanges();
    await flush(fixture);
    expect(q(fixture, 'auth-google')).toBeNull();
    expect(q(fixture, 'auth-form')).not.toBeNull();
  });

  it('says accounts are unavailable when the server has them switched off (no form)', async () => {
    setup({ 'GET /v1/auth/providers': () => json(200, { accounts: false, emailPassword: false, google: false }) });
    const fixture = TestBed.createComponent(AccountFormPage);
    fixture.detectChanges();
    await flush(fixture);
    expect(q(fixture, 'accounts-unavailable')).not.toBeNull();
    expect(q(fixture, 'auth-form')).toBeNull();
  });
});

describe('password reset screens', () => {
  const RESET = 'POST /api/auth/request-password-reset';
  const generic = () => json(200, { status: true, message: 'If this email exists in our system, check your email for the reset link' });

  async function openForgot(routes: Parameters<typeof fakeAuthBackend>[0] = {}) {
    const ctx = setup({ 'GET /v1/auth/providers': providersOk(), ...routes });
    const fixture = TestBed.createComponent(ForgotPasswordPage);
    fixture.detectChanges();
    await flush(fixture);
    return { ...ctx, fixture };
  }

  it('the sign-in screen links to it; sign-up does not; Google-only servers show no password UI at all', async () => {
    for (const [mode, expected] of [['sign-in', true], ['sign-up', false]] as const) {
      TestBed.resetTestingModule();
      setup({ 'GET /v1/auth/providers': providersOk() });
      const fixture = TestBed.createComponent(AccountFormPage);
      (fixture.componentRef as ComponentRef<AccountFormPage>).setInput('mode', mode);
      fixture.detectChanges();
      await flush(fixture);
      expect(q(fixture, 'auth-forgot') !== null, mode).toBe(expected);
    }
    TestBed.resetTestingModule();
    setup({ 'GET /v1/auth/providers': providersOk(true, false) });
    const googleOnly = TestBed.createComponent(AccountFormPage);
    googleOnly.detectChanges();
    await flush(googleOnly);
    expect(q(googleOnly, 'auth-forgot')).toBeNull();
  });

  it('checks the address before sending anything', async () => {
    const { fixture, backend } = await openForgot();
    expect(q(fixture, 'forgot-title')!.textContent).toContain('Reset your password');
    q(fixture, 'forgot-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(FIELD_ERRORS.emailRequired);
    type(fixture, 'email', 'not-an-address');
    q(fixture, 'forgot-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(FIELD_ERRORS.emailInvalid);
    expect(backend.calls.filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('asks the server for a link and says the same thing whatever the server knows about the address', async () => {
    const { fixture, backend } = await openForgot({ [RESET]: generic });
    type(fixture, 'email', '  alex@example.test ');
    q(fixture, 'forgot-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush(fixture);
    expect(backend.calls.at(-1)).toMatchObject({ method: 'POST', path: '/api/auth/request-password-reset', body: { email: 'alex@example.test' }, credentials: 'omit' });
    // Nothing but the address is sent: no redirect target, no password, no token.
    expect(Object.keys(backend.calls.at(-1)!.body as object)).toEqual(['email']);
    expect(backend.calls.at(-1)!.headers['authorization']).toBeUndefined();
    const notice = q(fixture, 'forgot-sent')!.textContent!;
    expect(notice).toContain("If alex@example.test has a StokeForm account, we've sent it a link");
    expect(notice).not.toMatch(/no account|not found|doesn't exist|unknown/i);
    expect(q(fixture, 'forgot-form')).toBeNull();
  });

  it('can send another link, and goes back to sign-in', async () => {
    const { fixture } = await openForgot({ [RESET]: generic });
    type(fixture, 'email', 'alex@example.test');
    q(fixture, 'forgot-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush(fixture);
    expect(q(fixture, 'forgot-back')!.getAttribute('href')).toBe('/auth/sign-in');
    q(fixture, 'forgot-again')!.click();
    fixture.detectChanges();
    expect(q(fixture, 'forgot-form')).not.toBeNull();
    expect(q(fixture, 'forgot-sent')).toBeNull();
  });

  it.each([
    [() => json(429, {}), 'rate-limited'],
    [() => Promise.reject(new TypeError('offline')), 'network'],
    [() => json(500, { message: 'database password=hunter2' }), 'unavailable'],
  ])('explains a failure in plain words, never the server’s (%#)', async (route, code) => {
    const { fixture } = await openForgot({ [RESET]: route as never });
    type(fixture, 'email', 'alex@example.test');
    q(fixture, 'forgot-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush(fixture);
    expect(q(fixture, 'auth-error')!.textContent).toContain(AUTH_ERRORS[code as keyof typeof AUTH_ERRORS].title);
    expect(fixture.nativeElement.textContent).not.toContain('hunter2');
    expect(q(fixture, 'forgot-sent')).toBeNull();
  });

  it('says accounts are unavailable when the server cannot send email (reset needs it)', async () => {
    setup({ 'GET /v1/auth/providers': providersOk(true, false) });
    const fixture = TestBed.createComponent(ForgotPasswordPage);
    fixture.detectChanges();
    await flush(fixture);
    expect(q(fixture, 'accounts-unavailable')).not.toBeNull();
    expect(q(fixture, 'forgot-form')).toBeNull();
  });
});

describe('AccountCardComponent', () => {
  it('a guest is offered an account, without being pushed to make one', async () => {
    const { forward, auth } = setup();
    await auth.restore();
    const fixture = TestBed.createComponent(AccountCardComponent);
    fixture.detectChanges();
    expect(q(fixture, 'account-guest')).not.toBeNull();
    q(fixture, 'account-sign-up')!.click();
    expect(forward).toHaveBeenCalledWith('/auth/sign-up');
    q(fixture, 'account-sign-in')!.click();
    expect(forward).toHaveBeenCalledWith('/auth/sign-in');
  });

  it('shows the signed-in account and signs out, keeping local data', async () => {
    localStorage.setItem('fitness.profile', '{"version":2}');
    const { auth, store } = setup({ 'POST /api/auth/sign-in/email': signedIn, 'POST /api/auth/sign-out': () => json(200, {}) });
    await auth.signIn('alex@example.test', 'correct horse battery');
    const fixture = TestBed.createComponent(AccountCardComponent);
    fixture.detectChanges();
    expect(q(fixture, 'account-name')!.textContent).toContain('Alex');
    expect(q(fixture, 'account-email')!.textContent).toContain('alex@example.test');
    q(fixture, 'account-sign-out')!.click();
    await flush(fixture);
    expect(q(fixture, 'account-guest')).not.toBeNull();
    expect(store.values.size).toBe(0);
    expect(localStorage.getItem('fitness.profile')).toBe('{"version":2}');
    localStorage.clear();
  });
});

describe('AuthCallbackPage (web)', () => {
  it('redeems the code and returns to You', async () => {
    const { auth, root } = setup({ 'POST /v1/auth/mobile/exchange': () => json(200, { token: TOKEN, user: USER }) }, { native: false });
    await auth.startGoogle();
    const fixture = TestBed.createComponent(AuthCallbackPage);
    fixture.componentRef.setInput('code', 'c');
    fixture.detectChanges();
    await flush(fixture);
    expect(auth.state().status).toBe('signed-in');
    expect(root).toHaveBeenCalledWith('/you');
  });

  it('explains an account that could not be joined to Google', async () => {
    setup({}, { native: false, query: { error: 'account-not-linked' } });
    const fixture = TestBed.createComponent(AuthCallbackPage);
    fixture.detectChanges();
    await flush(fixture);
    expect(q(fixture, 'callback-error')!.textContent).toContain(AUTH_ERRORS['account-not-linked'].title);
  });

  it('shows the failure when Google sends back an error', async () => {
    const { root } = setup({}, { native: false, query: { error: 'google-sign-in-failed' } });
    const fixture = TestBed.createComponent(AuthCallbackPage);
    fixture.detectChanges();
    await flush(fixture);
    expect(q(fixture, 'callback-error')!.textContent).toContain(AUTH_ERRORS['google-failed'].title);
    expect(root).not.toHaveBeenCalled();
  });
});
