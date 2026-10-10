import { TestBed } from '@angular/core/testing';

import { UserFitnessProfile } from '../../domain/fitness-profile';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { CLOCK } from '../time/clock';
import { FitnessProfileRepository } from './fitness-profile.repository';
import { FitnessProfileService } from './fitness-profile.service';
import { OnboardingStatusService } from './onboarding-status.service';
import { UnitPreferenceService } from './unit-preference.service';

const PROFILE: UserFitnessProfile = {
  primaryGoal: 'lose-fat',
  dateOfBirth: '1990-06-15',
  sex: 'male',
  height: { centimeters: 180 },
  weight: { kilograms: 80 },
  unitSystem: 'metric',
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  trainingLocation: 'gym',
  equipment: ['full-gym'],
  activityLevel: 'moderately-active',
  goalTarget: { targetWeight: { kilograms: 74 } },
  updatedAt: '2026-10-01T09:00:00.000Z',
};

const NOW = new Date('2026-10-10T08:30:00.000Z');

describe('UnitPreferenceService', () => {
  let storage: MemoryKeyValueStorage;

  async function setup(profile: UserFitnessProfile | null, reviewed: boolean) {
    storage = new MemoryKeyValueStorage();
    TestBed.configureTestingModule({
      providers: [
        { provide: KeyValueStorage, useValue: storage },
        { provide: CLOCK, useValue: () => NOW },
      ],
    });
    if (profile) {
      await TestBed.inject(FitnessProfileRepository).save(profile);
      if (reviewed) {
        await TestBed.inject(OnboardingStatusService).markAssessmentReviewed(profile);
      }
    }
    return TestBed.inject(UnitPreferenceService);
  }

  it('saves the new units, converting nothing, and keeps a reviewed assessment reviewed', async () => {
    const service = await setup(PROFILE, true);

    expect(await service.set('imperial')).toEqual({ ok: true, kind: 'updated' });

    const saved = await TestBed.inject(FitnessProfileRepository).load();
    expect(saved).toEqual({ ...PROFILE, unitSystem: 'imperial', updatedAt: NOW.toISOString() });
    expect(TestBed.inject(FitnessProfileService).profile()?.unitSystem).toBe('imperial');
    expect(await TestBed.inject(OnboardingStatusService).status()).toBe('complete');
  });

  it("doesn't mark an assessment reviewed that wasn't", async () => {
    const service = await setup(PROFILE, false);

    await service.set('imperial');

    expect(await TestBed.inject(OnboardingStatusService).status()).toBe('needs-assessment');
  });

  it('leaves the profile untouched when the units are already set', async () => {
    const service = await setup(PROFILE, true);

    expect(await service.set('metric')).toEqual({ ok: true, kind: 'unchanged' });
    expect(await TestBed.inject(FitnessProfileRepository).load()).toEqual(PROFILE);
  });

  it('reports a failed save and keeps the stored profile', async () => {
    const service = await setup(PROFILE, true);
    storage.failWrites = true;

    expect(await service.set('imperial')).toEqual({ ok: false, kind: 'save-failed' });
    expect(await TestBed.inject(FitnessProfileRepository).load()).toEqual(PROFILE);
    expect(await TestBed.inject(OnboardingStatusService).status()).toBe('complete');
  });

  it('has nothing to change without a profile', async () => {
    const service = await setup(null, false);

    expect(await service.set('imperial')).toEqual({ ok: false, kind: 'no-profile' });
  });

  it('applies changes in order', async () => {
    const service = await setup(PROFILE, true);

    const results = await Promise.all([service.set('imperial'), service.set('metric')]);

    expect(results.map((r) => r.kind)).toEqual(['updated', 'updated']);
    expect((await TestBed.inject(FitnessProfileRepository).load())?.unitSystem).toBe('metric');
  });
});
