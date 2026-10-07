import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';

import { UserFitnessProfile } from '../../domain/fitness-profile';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { FitnessProfileRepository } from './fitness-profile.repository';
import { FitnessProfileService } from './fitness-profile.service';
import { redirectIfOnboarded, requireOnboardingComplete } from './onboarding.guards';

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

  it('sends users without a profile to onboarding', async () => {
    setup();
    expect(urlOf(await runGuard(requireOnboardingComplete))).toBe('/onboarding');
    expect(await runGuard(redirectIfOnboarded)).toBe(true);
  });

  it('sends users with a profile to the app, never back to onboarding', async () => {
    setup();
    await TestBed.inject(FitnessProfileService).save(PROFILE);

    expect(await runGuard(requireOnboardingComplete)).toBe(true);
    expect(urlOf(await runGuard(redirectIfOnboarded))).toBe('/home');
  });

  it('recognises a profile saved in an earlier session', async () => {
    storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile: PROFILE }));
    setup();

    expect(await runGuard(requireOnboardingComplete)).toBe(true);
    expect(TestBed.inject(FitnessProfileService).profile()).toEqual(PROFILE);
  });
});
