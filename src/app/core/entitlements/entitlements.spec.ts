import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';

import { routes } from '../../app.routes';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { OnboardingStatusService } from '../profile/onboarding-status.service';
import { requireAppReady, requireOnboardingComplete } from '../profile/onboarding.guards';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { CLOCK } from '../time/clock';
import { FEATURE_MATRIX, FREE_FEATURES, PREMIUM_FEATURES, canAccess } from './access-policy';
import { ActiveSubscription, BILLING_PROVIDER, BillingProvider, NO_BILLING, PurchaseOutcome } from './billing';
import { EntitlementService } from './entitlement.service';
import { FirstRunOfferService } from './first-run-offer.service';

const NOW = new Date('2026-10-18T12:00:00.000Z');

/** A provider whose answers each test sets. */
function fakeBilling(overrides: Partial<BillingProvider> = {}): BillingProvider {
  return { ...NO_BILLING, id: 'fake', ...overrides };
}

function entitlements(billing: BillingProvider = NO_BILLING) {
  TestBed.configureTestingModule({
    providers: [
      { provide: BILLING_PROVIDER, useValue: billing },
      { provide: CLOCK, useValue: () => NOW },
    ],
  });
  return TestBed.inject(EntitlementService);
}

const subscription = (s: Partial<ActiveSubscription> = {}): ActiveSubscription => ({
  productId: 'premium-monthly',
  active: true,
  expiresAt: '2026-11-18T12:00:00.000Z',
  ...s,
});

describe('EntitlementService', () => {
  it('without a billing provider (today) everyone is Free, nothing can be bought, and a "buy" never grants Premium', async () => {
    const service = entitlements();
    expect(service.entitlement()).toEqual({ status: 'loading' });
    expect(service.plan()).toBe('free'); // Unknown never means Premium.

    expect(await service.refresh()).toEqual({ status: 'free', reason: 'default' });
    expect(await service.availability()).toEqual({ status: 'unavailable', reason: 'not-configured' });
    expect(await service.buy('premium-monthly')).toEqual({ status: 'failed', reason: 'not-available' });
    expect(service.plan()).toBe('free');
  });

  it('Premium only while the provider confirms an active, unexpired subscription', async () => {
    let current: ActiveSubscription | null = subscription();
    const service = entitlements(fakeBilling({ activeSubscription: async () => current }));

    expect(await service.refresh()).toEqual({ status: 'premium', productId: 'premium-monthly', expiresAt: '2026-11-18T12:00:00.000Z' });
    expect(service.plan()).toBe('premium');

    current = subscription({ expiresAt: '2026-10-01T00:00:00.000Z' });
    expect(await service.refresh()).toEqual({ status: 'free', reason: 'expired' });
    current = subscription({ active: false });
    expect(await service.refresh()).toEqual({ status: 'free', reason: 'expired' });
    expect(service.plan()).toBe('free');
  });

  it("an error asking the provider resolves to Free (unverified), never Premium", async () => {
    const service = entitlements(fakeBilling({ activeSubscription: () => Promise.reject(new Error('store down')) }));
    expect(await service.refresh()).toEqual({ status: 'free', reason: 'unverified' });
    expect(service.plan()).toBe('free');
  });

  it("a store's \"completed\" counts only once the entitlement check confirms it", async () => {
    let confirmed = false;
    const service = entitlements(
      fakeBilling({
        purchase: async () => ({ kind: 'completed' }),
        activeSubscription: async () => (confirmed ? subscription() : null),
      }),
    );
    expect(await service.buy('premium-monthly')).toEqual({ status: 'failed', reason: 'not-confirmed' });
    expect(service.plan()).toBe('free');

    confirmed = true;
    expect(await service.buy('premium-monthly')).toEqual({ status: 'idle' });
    expect(service.plan()).toBe('premium');
  });

  it.each<[string, PurchaseOutcome | Error, object]>([
    ['cancelled', { kind: 'cancelled' }, { status: 'cancelled' }],
    ['declined', { kind: 'failed', reason: 'payment-declined' }, { status: 'failed', reason: 'payment-declined' }],
    ['pending (deferred payment)', { kind: 'pending' }, { status: 'pending', productId: 'premium-monthly' }],
    ['thrown', new Error('boom'), { status: 'failed', reason: 'store-error' }],
  ])('a %s purchase leaves the user on Free', async (_name, outcome, expected) => {
    const service = entitlements(
      fakeBilling({ purchase: () => (outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome)) }),
    );
    await service.refresh();
    expect(await service.buy('premium-monthly')).toEqual(expected);
    expect(service.plan()).toBe('free');
  });

  it('restore re-reads the entitlement: a lapsed subscription stays Free', async () => {
    const restore = vi.fn(async () => undefined);
    const service = entitlements(fakeBilling({ restore, activeSubscription: async () => subscription({ active: false }) }));
    expect(await service.restore()).toEqual({ status: 'free', reason: 'expired' });
    expect(restore).toHaveBeenCalledOnce();
  });
});

describe('access policy (feature matrix)', () => {
  it('every feature that existed before Premium is Free and usable; exercise browsing included', () => {
    for (const rule of FEATURE_MATRIX.filter((r) => r.available && r.id !== 'custom-workout-plan')) {
      expect(rule.tier).toBe('free');
      expect(canAccess(rule.id, 'free')).toBe(true);
    }
    expect(canAccess('exercise-library', 'free')).toBe(true);
    expect(FREE_FEATURES.length).toBeGreaterThan(0);
  });

  it('the custom workout plan is Premium only: Free cannot use it, Premium can', () => {
    expect(FEATURE_MATRIX.find((r) => r.id === 'custom-workout-plan')).toMatchObject({ tier: 'premium', available: true });
    expect(canAccess('custom-workout-plan', 'free')).toBe(false);
    expect(canAccess('custom-workout-plan', 'premium')).toBe(true);
  });

  it('the other Premium candidates are not built, so nobody can use them yet, Premium included', () => {
    const candidates = PREMIUM_FEATURES.filter((r) => r.id !== 'custom-workout-plan');
    expect(candidates.map((r) => r.id)).toEqual(['cloud-backup', 'progress-photos', 'health-app-sync']);
    for (const rule of candidates) {
      expect(canAccess(rule.id, 'free')).toBe(false);
      expect(canAccess(rule.id, 'premium')).toBe(false);
    }
  });

  it('lists each feature once', () => {
    expect(new Set(FEATURE_MATRIX.map((r) => r.id)).size).toBe(FEATURE_MATRIX.length);
  });
});

const PROFILE: UserFitnessProfile = {
  primaryGoal: 'improve-fitness',
  dateOfBirth: '1985-11-02',
  sex: 'prefer-not-to-say',
  height: { centimeters: 172 },
  weight: { kilograms: 68 },
  unitSystem: 'metric',
  trainingExperience: 'beginner',
  trainingDaysPerWeek: 2,
  trainingLocation: 'home',
  equipment: ['bodyweight-only'],
  activityLevel: 'moderately-active',
  goalTarget: { targetWeight: null },
  updatedAt: '2026-10-07T10:00:00.000Z',
};

describe('first-run plan offer', () => {
  let storage: MemoryKeyValueStorage;

  beforeEach(() => {
    storage = new MemoryKeyValueStorage();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: KeyValueStorage, useValue: storage }] });
  });

  const run = (guard: typeof requireAppReady, url = '/home') =>
    TestBed.runInInjectionContext(() => guard({} as never, { url } as never)) as Promise<boolean | UrlTree>;
  const urlOf = (result: boolean | UrlTree) => (result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result);
  async function finishSetup() {
    await TestBed.inject(FitnessProfileService).save(PROFILE);
    await TestBed.inject(OnboardingStatusService).markAssessmentReviewed(PROFILE);
  }

  it('the marker and the choice hold no health data, and choosing clears the marker', async () => {
    const offer = TestBed.inject(FirstRunOfferService);
    expect(await offer.isPending()).toBe(false);
    await offer.markPending();
    expect(await offer.isPending()).toBe(true);
    expect(JSON.parse(storage.values.get('stokeform.first-run-offer')!)).toEqual({ version: 1 });

    await offer.choose('free', 'user-1');
    expect(await offer.isPending()).toBe(false);
    expect(JSON.parse(storage.values.get('stokeform.plan-choice')!)).toMatchObject({ version: 1, choice: 'free', accountId: 'user-1' });
  });

  it('just after first-run setup, the app shows the offer once and then the page the user was going to', async () => {
    await finishSetup();
    await TestBed.inject(FirstRunOfferService).markPending();
    expect(urlOf(await run(requireAppReady, '/home'))).toBe('/offer?next=%2Fhome');

    await TestBed.inject(FirstRunOfferService).choose('free', null);
    expect(await run(requireAppReady, '/home')).toBe(true);
  });

  it('existing users (no marker) are never sent to the offer', async () => {
    await finishSetup();
    expect(await run(requireAppReady, '/you')).toBe(true);
  });

  it('setup steps still come first: no profile → onboarding; unreviewed → assessment (the offer waits)', async () => {
    await TestBed.inject(FirstRunOfferService).markPending();
    expect(urlOf(await run(requireAppReady))).toBe('/onboarding');
    await TestBed.inject(FitnessProfileService).save(PROFILE);
    expect(urlOf(await run(requireAppReady))).toBe('/assessment');
  });

  it('an active workout and the offer screen itself are not behind the offer gate (no interruptions, no loops)', async () => {
    const guardsOf = (path: string) => routes.find((r) => r.path === path)?.canActivate ?? [];
    expect(guardsOf('workout/session/:sessionId/active')).toEqual([requireOnboardingComplete]);
    expect(guardsOf('workout/summary/:workoutId')).toEqual([requireOnboardingComplete]);
    expect(guardsOf('offer')).toEqual([requireOnboardingComplete]);
    expect(guardsOf('')).toEqual([requireAppReady]);

    await finishSetup();
    await TestBed.inject(FirstRunOfferService).markPending();
    expect(await run(requireOnboardingComplete)).toBe(true);
  });
});
