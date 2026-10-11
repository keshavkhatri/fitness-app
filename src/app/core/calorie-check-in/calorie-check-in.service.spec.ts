import { TestBed } from '@angular/core/testing';

import { WeightEntry } from '../../domain/body-measurements';
import { calculateFitnessAssessment } from '../../domain/fitness-calculations';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { FoodEntry, createFoodEntry } from '../../domain/nutrition';
import { WeightHistoryRepository } from '../body-measurements/weight-history.repository';
import { FitnessAssessmentService } from '../calculations/fitness-assessment.service';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { OnboardingStatusService } from '../profile/onboarding-status.service';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { CLOCK } from '../time/clock';
import { CalorieCheckInService } from './calorie-check-in.service';

// Synthetic data only. "Now" is Thursday 29 October 2026, 09:00 local; the period is 1–28 October.
const NOW = new Date(2026, 9, 29, 9, 0);
const PROFILE: UserFitnessProfile = {
  primaryGoal: 'lose-fat',
  dateOfBirth: '1990-06-15',
  sex: 'male',
  height: { centimeters: 180 },
  weight: { kilograms: 84 },
  unitSystem: 'metric',
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  trainingLocation: 'gym',
  equipment: ['full-gym'],
  activityLevel: 'moderately-active',
  goalTarget: { targetWeight: null },
  updatedAt: '2026-09-01T09:00:00.000Z',
};
const FORMULA = (() => {
  const r = calculateFitnessAssessment(PROFILE, { asOfDate: '2026-10-29' });
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
})();
const KEYS = { profile: 'fitness.profile', food: 'fitness.nutrition-entries', weights: 'fitness.body-weight-entries', reviewed: 'fitness.assessment-reviewed', plan: 'fitness.workout-plan' };

const date = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10);
let seq = 0;
const food = (d: string, calories: number): FoodEntry => {
  const r = createFoodEntry({ name: 'Meal', quantity: 1, unit: 'serving', meal: 'lunch', calories, proteinGrams: 30, carbohydrateGrams: 50, fatGrams: 20 }, { id: `f${++seq}`, date: d, now: `${d}T12:00:00.000Z` });
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
};
const weigh = (d: string, kilograms: number): WeightEntry => ({ id: `w-${d}`, date: d, weight: { kilograms }, createdAt: `${d}T07:00:00.000Z`, updatedAt: `${d}T07:00:00.000Z` });
/** Observed maintenance 600 kcal below the formula's: a capped (−250) proposal. */
const FOODS = Array.from({ length: 28 }, (_, n) => food(date(n), FORMULA.estimates.tdeeKcal - 550 - 600));
const WEIGHTS = Array.from({ length: 14 }, (_, i) => weigh(date(i * 2), Math.round((84 - (0.5 / 7) * i * 2) * 100) / 100));

function setup(options: { profile?: UserFitnessProfile | null; reviewed?: boolean; foods?: FoodEntry[] } = {}) {
  const storage = new MemoryKeyValueStorage();
  const profile = options.profile === undefined ? PROFILE : options.profile;
  if (profile) {
    storage.values.set(KEYS.profile, JSON.stringify({ version: 2, profile }));
    if (options.reviewed !== false) {
      storage.values.set(KEYS.reviewed, JSON.stringify({ version: 1, profileUpdatedAt: profile.updatedAt }));
    }
  }
  storage.values.set(KEYS.food, JSON.stringify({ version: 1, entries: options.foods ?? FOODS }));
  storage.values.set(KEYS.weights, JSON.stringify({ version: 1, entries: WEIGHTS }));
  storage.values.set(KEYS.plan, '{"synthetic":"plan"}');
  TestBed.configureTestingModule({ providers: [{ provide: KeyValueStorage, useValue: storage }, { provide: CLOCK, useValue: () => NOW }] });
  return { storage, service: TestBed.inject(CalorieCheckInService) };
}

const savedProfile = (storage: MemoryKeyValueStorage) => JSON.parse(storage.values.get(KEYS.profile)!).profile as UserFitnessProfile;

describe('CalorieCheckInService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads the check-in from the app’s own records, and writes nothing', async () => {
    const { service, storage } = setup();
    const before = new Map(storage.values);
    const { today, unitSystem, checkIn } = await service.load();
    expect(today).toBe('2026-10-29');
    expect(unitSystem).toBe('metric');
    expect(checkIn.period).toEqual({ from: '2026-10-01', to: '2026-10-28', days: 28 });
    expect(checkIn.intake).toMatchObject({ loggedDays: 28 });
    expect(checkIn.weight).toMatchObject({ weighIns: 14, kgPerWeek: -0.5 });
    expect(checkIn.current).toMatchObject({ kind: 'ready', targetKcal: FORMULA.targets.calories.finalKcal, maintenanceSource: 'formula' });
    expect(checkIn.recommendation).toMatchObject({ kind: 'adjust', maintenanceKcal: FORMULA.estimates.tdeeKcal - 250 });
    expect(new Map(storage.values)).toEqual(before);
  });

  it('accepting the confirmed proposal saves a calibration on the profile; targets and macros follow everywhere', async () => {
    const { service, storage } = setup();
    const { checkIn } = await service.load();
    if (checkIn.recommendation.kind !== 'adjust') {
      throw new Error('adjust');
    }
    const { maintenanceKcal, targetKcal } = checkIn.recommendation;
    expect(await service.accept({ maintenanceKcal, targetKcal })).toEqual({ ok: true, targetKcal });

    const saved = savedProfile(storage);
    expect(saved.energyCalibration).toEqual({ maintenanceKcal, observedFrom: '2026-10-01', observedTo: '2026-10-28', acceptedAt: NOW.toISOString() });
    expect(saved.updatedAt).toBe(NOW.toISOString());
    expect({ ...saved, energyCalibration: undefined, updatedAt: PROFILE.updatedAt }).toEqual({ ...PROFILE, energyCalibration: undefined });
    const current = await TestBed.inject(FitnessAssessmentService).current();
    expect(current).toMatchObject({ kind: 'ready', assessment: { targets: { calories: { finalKcal: targetKcal } } } });
    if (current.kind === 'ready') {
      expect(current.assessment.targets.macros).toEqual(checkIn.recommendation.macros);
    }
    // Reviewed before → still reviewed (the user just reviewed the new target); the plan is untouched.
    expect(await TestBed.inject(OnboardingStatusService).status()).toBe('complete');
    expect(storage.values.get(KEYS.plan)).toBe('{"synthetic":"plan"}');
    // Reopening: nothing more to apply right away.
    expect((await service.load()).checkIn.recommendation).toMatchObject({ kind: 'keep', reason: 'recently-adjusted' });
  });

  it('a stale or altered proposal is never applied', async () => {
    const { service, storage } = setup();
    const before = storage.values.get(KEYS.profile);
    const { checkIn } = await service.load();
    if (checkIn.recommendation.kind !== 'adjust') {
      throw new Error('adjust');
    }
    const altered = await service.accept({ maintenanceKcal: checkIn.recommendation.maintenanceKcal - 100, targetKcal: checkIn.recommendation.targetKcal });
    expect(altered).toMatchObject({ ok: false, kind: 'changed' });
    // Data changed since it was shown: logged intake now matches the formula.
    storage.values.set(KEYS.food, JSON.stringify({ version: 1, entries: Array.from({ length: 28 }, (_, n) => food(date(n), FORMULA.estimates.tdeeKcal - 550)) }));
    const stale = await service.accept({ maintenanceKcal: checkIn.recommendation.maintenanceKcal, targetKcal: checkIn.recommendation.targetKcal });
    expect(stale).toMatchObject({ ok: false, kind: 'changed', snapshot: { checkIn: { recommendation: { kind: 'keep', reason: 'consistent' } } } });
    expect(storage.values.get(KEYS.profile)).toBe(before);
  });

  it('a failed save leaves the profile unchanged', async () => {
    const { service, storage } = setup();
    const before = storage.values.get(KEYS.profile);
    const { checkIn } = await service.load();
    if (checkIn.recommendation.kind !== 'adjust') {
      throw new Error('adjust');
    }
    storage.failWrites = true;
    expect(await service.accept({ maintenanceKcal: checkIn.recommendation.maintenanceKcal, targetKcal: checkIn.recommendation.targetKcal })).toEqual({ ok: false, kind: 'save-failed' });
    expect(storage.values.get(KEYS.profile)).toBe(before);
  });

  it('an unreviewed assessment stays unreviewed after accepting', async () => {
    const { service } = setup({ reviewed: false });
    const { checkIn } = await service.load();
    if (checkIn.recommendation.kind !== 'adjust') {
      throw new Error('adjust');
    }
    await service.accept({ maintenanceKcal: checkIn.recommendation.maintenanceKcal, targetKcal: checkIn.recommendation.targetKcal });
    expect(await TestBed.inject(OnboardingStatusService).status()).toBe('needs-assessment');
  });

  it('“use the calculated target” removes the calibration; without one there is nothing to change', async () => {
    const energyCalibration = { maintenanceKcal: 2500, observedFrom: '2026-09-01', observedTo: '2026-09-28', acceptedAt: '2026-09-29T09:00:00.000Z' };
    const { service, storage } = setup({ profile: { ...PROFILE, energyCalibration } });
    expect(await service.useFormula()).toEqual({ ok: true, targetKcal: null });
    const saved = savedProfile(storage);
    expect('energyCalibration' in saved).toBe(false);
    expect(await TestBed.inject(FitnessAssessmentService).current()).toMatchObject({ assessment: { targets: { calories: { finalKcal: FORMULA.targets.calories.finalKcal } } } });
    expect(await service.useFormula()).toMatchObject({ ok: false, kind: 'changed' });
    expect(savedProfile(storage)).toEqual(saved);
  });

  it('without a profile: the estimate is shown, nothing can be accepted', async () => {
    const { service, storage } = setup({ profile: null });
    const { checkIn } = await service.load();
    expect(checkIn.current).toEqual({ kind: 'no-profile' });
    expect(checkIn.maintenance.kind).toBe('estimate');
    expect(await service.accept({ maintenanceKcal: 2500, targetKcal: 2100 })).toMatchObject({ ok: false, kind: 'changed' });
    expect(storage.values.has(KEYS.profile)).toBe(false);
  });

  it('load rejects when the weight history can’t be read (shown as an error, never as “no data”)', async () => {
    const { service } = setup();
    vi.spyOn(TestBed.inject(WeightHistoryRepository), 'list').mockRejectedValueOnce(new Error('storage'));
    await expect(service.load()).rejects.toThrow();
  });

  it('updates the cached profile other screens read', async () => {
    const { service } = setup();
    const { checkIn } = await service.load();
    if (checkIn.recommendation.kind !== 'adjust') {
      throw new Error('adjust');
    }
    await service.accept({ maintenanceKcal: checkIn.recommendation.maintenanceKcal, targetKcal: checkIn.recommendation.targetKcal });
    expect(TestBed.inject(FitnessProfileService).profile()?.energyCalibration?.maintenanceKcal).toBe(checkIn.recommendation.maintenanceKcal);
  });
});
