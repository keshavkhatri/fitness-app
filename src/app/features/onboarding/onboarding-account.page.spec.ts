import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { AUTH_API_BASE_URL, AUTH_FETCH, AccountUser } from '../../core/auth/auth-api';
import { APP_AUTH_CALLBACK, AUTH_PLATFORM, AuthService } from '../../core/auth/auth.service';
import { MemorySecretStore, SECRET_STORE } from '../../core/auth/session-store';
import { API, PROVIDERS_ALL, TOKEN, USER, confirmationSent, fakeAuthBackend, fakePlatform, json } from '../../core/auth/testing/fake-auth-backend';
import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { OnboardingPage } from './onboarding.page';
import { OnboardingFlow } from './state/onboarding-flow.service';
import { completeDraft } from './testing/draft-fixtures';

const PROGRESS_KEY = 'fitness.onboarding-progress';

interface RenderOptions {
  readonly stepId?: string;
  readonly signedInAs?: AccountUser | null;
  readonly routes?: Parameters<typeof fakeAuthBackend>[0];
  readonly base?: string | null;
  readonly identityName?: string;
}

/** The onboarding page at a step, with the real AuthService over a fake API, secret store and platform. */
async function render({ stepId = 'account', signedInAs = null, routes = {}, base = API, identityName }: RenderOptions = {}) {
  const storage = new MemoryKeyValueStorage();
  storage.values.set(PROGRESS_KEY, JSON.stringify({ version: 3, stepId, draft: completeDraft(), editingFromSummary: false }));
  if (identityName) {
    storage.values.set('fitness.identity', JSON.stringify({ version: 1, name: identityName, photo: null }));
  }
  const secrets = new MemorySecretStore();
  if (signedInAs) {
    await secrets.set('session', JSON.stringify({ token: TOKEN, user: signedInAs }));
  }
  const backend = fakeAuthBackend({
    'GET /v1/auth/providers': () => json(200, PROVIDERS_ALL),
    'GET /v1/auth/me': () => json(200, { user: signedInAs ?? USER }),
    ...routes,
  });
  const fake = fakePlatform(true);
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      OnboardingFlow,
      { provide: KeyValueStorage, useValue: storage },
      { provide: AUTH_FETCH, useValue: backend.fetch },
      { provide: AUTH_API_BASE_URL, useValue: base },
      { provide: SECRET_STORE, useValue: secrets },
      { provide: AUTH_PLATFORM, useValue: fake.platform },
    ],
  });
  const auth = TestBed.inject(AuthService);
  await auth.restore();
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const forward = vi.spyOn(TestBed.inject(NavController), 'navigateForward').mockResolvedValue(true);
  const save = vi.spyOn(TestBed.inject(FitnessProfileService), 'save');

  const fixture = TestBed.createComponent(OnboardingPage);
  fixture.detectChanges();
  const flow = fixture.debugElement.injector.get(OnboardingFlow);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
    }
  };
  await vi.waitFor(() => expect(flow.ready()).toBe(true));
  await settle();
  const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const primary = () => el.querySelector<HTMLButtonElement>('ion-footer button');
  const progress = () => JSON.parse(storage.values.get(PROGRESS_KEY) ?? 'null') as { stepId: string; draft: unknown } | null;
  const identity = () => JSON.parse(storage.values.get('fitness.identity') ?? 'null') as { name: string | null } | null;
  return { fixture, flow, el, q, primary, settle, progress, identity, navigate, forward, save, backend, auth, storage, ...fake };
}

describe('Onboarding: the account gate', () => {
  it('finishing the questionnaire leads to the account gate, not to results: nothing is created yet', async () => {
    const { primary, flow, settle, q, save, navigate, progress } = await render({ stepId: 'summary' });
    primary()!.click();
    await settle();

    expect(flow.stepId()).toBe('account');
    expect(q('account-step-google')).not.toBeNull();
    expect(q('account-step-sign-up')).not.toBeNull();
    expect(q('account-step-sign-in')).not.toBeNull();
    // Signed out: no way past the gate from the footer, and no profile, assessment or plan.
    expect(primary()).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(TestBed.inject(FitnessProfileService).hasProfile()).toBe(false);
    expect(progress()).toMatchObject({ stepId: 'account', draft: completeDraft() });
  });

  it('email sign-up and sign-in use the existing account screens and come back here, the answers waiting on the device', async () => {
    const { q, forward, progress } = await render();
    q('account-step-sign-up')!.click();
    expect(forward).toHaveBeenLastCalledWith('/auth/sign-up', { queryParams: { next: '/onboarding' } });
    q('account-step-sign-in')!.click();
    expect(forward).toHaveBeenLastCalledWith('/auth/sign-in', { queryParams: { next: '/onboarding' } });
    expect(progress()).toMatchObject({ stepId: 'account', draft: completeDraft() });
  });

  it('a sign-up waiting for email confirmation does not open the gate; the answers are kept', async () => {
    const { auth, q, primary, settle, progress, save } = await render({ routes: { 'POST /api/auth/sign-up/email': confirmationSent } });
    expect(await auth.signUp('Alex', 'alex@example.test', 'correct horse battery')).toEqual({ ok: true, value: null });
    await settle();
    expect(auth.state().status).toBe('guest');
    expect(q('account-step-sign-up')).not.toBeNull();
    expect(primary()).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(progress()).toMatchObject({ stepId: 'account', draft: completeDraft() });
  });

  it("Google: the system browser opens; after the app link it is signed in, uses Google's name, and a double tap creates the profile once", async () => {
    const { q, settle, platform, deepLink, primary, flow, save, identity, el } = await render({
      routes: { 'POST /v1/auth/mobile/exchange': () => json(200, { token: TOKEN, user: { ...USER, name: 'Alex Morgan' } }) },
    });
    q('account-step-google')!.click();
    await settle();
    expect(platform.opened).toHaveLength(1);
    expect(q('account-step-google-pending')).not.toBeNull();

    deepLink(`${APP_AUTH_CALLBACK}?code=one-time`);
    await settle();
    expect(q('account-step-signed-in')!.textContent).toContain('alex@example.test');
    expect(el.textContent).toContain("We'll call you Alex Morgan");
    expect(primary()!.textContent!.trim()).toBe('Create my profile');

    primary()!.click();
    primary()!.click();
    await vi.waitFor(() => expect(flow.stepId()).toBe('finish'));
    await settle();
    expect(save).toHaveBeenCalledOnce();
    expect(identity()?.name).toBe('Alex Morgan');
    // Only now: the preview of the real plan made from the saved profile (3 training days in the fixture).
    await vi.waitFor(async () => {
      await settle();
      expect(q('plan-preview')).not.toBeNull();
    });
    expect(q('plan-preview')!.textContent).toMatch(/exercises · about \d+ min/);
  });

  it('a cancelled or failed Google sign-in explains it, keeps the answers, and stays at the gate', async () => {
    const { q, settle, deepLink, progress, save, primary } = await render();
    q('account-step-google')!.click();
    await settle();
    deepLink(`${APP_AUTH_CALLBACK}?error=google-sign-in-failed`);
    await settle();
    expect(q('account-step-google-error')!.textContent).toContain("Google sign-in didn't finish");
    expect(primary()).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(progress()).toMatchObject({ stepId: 'account', draft: completeDraft() });
  });

  it("asks for a name once when the account has none, and saves it on the device and the account", async () => {
    const { el, q, primary, settle, flow, save, identity, backend } = await render({
      signedInAs: { ...USER, name: '' },
      routes: { 'POST /api/auth/update-user': () => json(200, { status: true }) },
    });
    expect(q('account-step-name')).not.toBeNull();
    primary()!.click();
    await settle();
    expect(el.textContent).toContain('Add your name to continue.');
    expect(save).not.toHaveBeenCalled();

    const input = q('account-step-name')!.querySelector('input')!;
    input.value = '  Sam  ';
    input.dispatchEvent(new Event('input'));
    await settle();
    // A deliberate second tap, not the ghost of the first (the page ignores taps 350 ms apart or less).
    await new Promise((r) => setTimeout(r, 400));
    primary()!.click();
    await vi.waitFor(() => expect(flow.stepId()).toBe('finish'));
    await settle();
    expect(save).toHaveBeenCalledOnce();
    expect(identity()?.name).toBe('Sam');
    expect(backend.calls.find((c) => c.path === '/api/auth/update-user')).toMatchObject({ method: 'POST', body: { name: 'Sam' }, headers: { authorization: `Bearer ${TOKEN}` } });
  });

  it("a name already chosen on this device wins, and the account isn't changed", async () => {
    const { el, primary, settle, flow, identity, backend } = await render({ signedInAs: USER, identityName: 'Kim' });
    expect(el.textContent).toContain("We'll call you Kim");
    primary()!.click();
    await vi.waitFor(() => expect(flow.stepId()).toBe('finish'));
    await settle();
    expect(identity()?.name).toBe('Kim');
    expect(backend.calls.some((c) => c.path === '/api/auth/update-user')).toBe(false);
  });

  it('a build without accounts does not strand anyone: setup continues without an account', async () => {
    const { q, primary, settle, flow, save, identity } = await render({ base: null });
    expect(q('account-step-off')).not.toBeNull();
    expect(primary()!.textContent!.trim()).toBe('Continue without an account');
    const input = q('account-step-name')!.querySelector('input')!;
    input.value = 'Robin';
    input.dispatchEvent(new Event('input'));
    await settle();
    primary()!.click();
    await vi.waitFor(() => expect(flow.stepId()).toBe('finish'));
    expect(save).toHaveBeenCalledOnce();
    expect(identity()?.name).toBe('Robin');
  });

  it('when the account service is unreachable, the gate stays closed with a retry (answers kept)', async () => {
    const { q, primary, settle, save, progress } = await render({ routes: { 'GET /v1/auth/providers': () => Promise.reject(new TypeError('offline')) } });
    expect(q('account-step-error')!.textContent).toContain("Couldn't reach StokeForm");
    expect(q('account-step-retry')).not.toBeNull();
    expect(primary()).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(progress()).toMatchObject({ stepId: 'account' });
    await settle();
  });

  it('Back from the account gate returns to the summary with every answer', async () => {
    const { el, settle, flow } = await render();
    el.querySelector<HTMLButtonElement>('ion-header .back')!.click();
    await settle();
    expect(flow.stepId()).toBe('summary');
    expect(flow.draft()).toEqual(completeDraft());
  });
});
