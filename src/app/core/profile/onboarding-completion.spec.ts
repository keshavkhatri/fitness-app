import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';

import { UserFitnessProfile } from '../../domain/fitness-profile';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { FitnessProfileRepository } from './fitness-profile.repository';
import { FitnessProfileService } from './fitness-profile.service';
import { OnboardingStatusService } from './onboarding-status.service';
import { redirectIfOnboarded, requireOnboardingComplete, requireProfile } from './onboarding.guards';

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

describe('onboarding completion', () => {
  let storage: MemoryKeyValueStorage;

  function setup() {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: KeyValueStorage, useValue: storage }],
    });
  }

  const runGuard = (guard: typeof requireOnboardingComplete) =>
    TestBed.runInInjectionContext(() => guard({} as never, {} as never)) as Promise<boolean | UrlTree>;
  const urlOf = (result: boolean | UrlTree) =>
    result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;

  beforeEach(() => {
    storage = new MemoryKeyValueStorage();
  });

  it('round-trips the profile through local persistence', async () => {
    setup();
    const repository = TestBed.inject(FitnessProfileRepository);

    await repository.save(PROFILE);
    const stored = JSON.parse(storage.values.get('fitness.profile')!);
    expect(stored).toMatchObject({ version: 2, profile: { dateOfBirth: '1985-11-02' } });
    expect(stored.profile).not.toHaveProperty('age');
    expect(await repository.load()).toEqual(PROFILE);
  });

  it('treats corrupt or unknown-version stored data as no profile', async () => {
    setup();
    const repository = TestBed.inject(FitnessProfileRepository);

    storage.values.set('fitness.profile', 'not json');
    expect(await repository.load()).toBeNull();

    storage.values.set('fitness.profile', JSON.stringify({ version: 99, profile: PROFILE }));
    expect(await repository.load()).toBeNull();

    // v1 stored `age`, which cannot be turned into a date of birth.
    const legacy: Record<string, unknown> = { ...PROFILE, age: 40 };
    delete legacy['dateOfBirth'];
    storage.values.set('fitness.profile', JSON.stringify({ version: 1, profile: legacy }));
    expect(await repository.load()).toBeNull();
  });

  describe('first-run routing: onboarding → assessment → home', () => {
    it('no profile: app and assessment send to onboarding; onboarding is allowed', async () => {
      setup();
      expect(urlOf(await runGuard(requireOnboardingComplete))).toBe('/onboarding');
      expect(urlOf(await runGuard(requireProfile))).toBe('/onboarding');
      expect(await runGuard(redirectIfOnboarded)).toBe(true);
      expect(await TestBed.inject(OnboardingStatusService).status()).toBe('needs-onboarding');
    });

    it('profile but assessment not reviewed: app and onboarding send to the assessment', async () => {
      setup();
      await TestBed.inject(FitnessProfileService).save(PROFILE);

      expect(urlOf(await runGuard(requireOnboardingComplete))).toBe('/assessment');
      expect(urlOf(await runGuard(redirectIfOnboarded))).toBe('/assessment');
      expect(await runGuard(requireProfile)).toBe(true);
    });

    it('assessment reviewed: the app opens, onboarding redirects home, assessment stays reachable', async () => {
      setup();
      await TestBed.inject(FitnessProfileService).save(PROFILE);
      await TestBed.inject(OnboardingStatusService).markAssessmentReviewed(PROFILE);

      expect(await runGuard(requireOnboardingComplete)).toBe(true);
      expect(urlOf(await runGuard(redirectIfOnboarded))).toBe('/home');
      expect(await runGuard(requireProfile)).toBe(true);
    });

    it('a changed profile needs its assessment reviewed again', async () => {
      setup();
      const status = TestBed.inject(OnboardingStatusService);
      await TestBed.inject(FitnessProfileService).save(PROFILE);
      await status.markAssessmentReviewed(PROFILE);

      await TestBed.inject(FitnessProfileService).save({ ...PROFILE, updatedAt: '2026-11-01T08:00:00.000Z' });
      expect(await status.status()).toBe('needs-assessment');
    });

    it('stores only a version marker for the review, no health data', async () => {
      setup();
      await TestBed.inject(OnboardingStatusService).markAssessmentReviewed(PROFILE);
      expect(JSON.parse(storage.values.get('fitness.assessment-reviewed')!)).toEqual({
        version: 1,
        profileUpdatedAt: PROFILE.updatedAt,
      });
    });

    it('recognises a profile and review saved in an earlier session', async () => {
      storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile: PROFILE }));
      storage.values.set(
        'fitness.assessment-reviewed',
        JSON.stringify({ version: 1, profileUpdatedAt: PROFILE.updatedAt }),
      );
      setup();

      expect(await runGuard(requireOnboardingComplete)).toBe(true);
      expect(TestBed.inject(FitnessProfileService).profile()).toEqual(PROFILE);
    });

    it('treats a corrupt review marker as not reviewed', async () => {
      storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile: PROFILE }));
      storage.values.set('fitness.assessment-reviewed', '{oops');
      setup();
      expect(urlOf(await runGuard(requireOnboardingComplete))).toBe('/assessment');
    });
  });
});
