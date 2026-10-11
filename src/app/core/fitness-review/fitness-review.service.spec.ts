import { TestBed } from '@angular/core/testing';

import { BodyCompositionAssessment, MANUAL_INBODY_SOURCE } from '../../domain/body-composition';
import { MeasurementEntry, WeightEntry } from '../../domain/body-measurements';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { FoodEntryInput, createFoodEntry } from '../../domain/nutrition';
import { finishedLog, planFor } from '../../domain/workout-session/testing/workout-log-fixtures';
import { WeightHistoryRepository } from '../body-measurements/weight-history.repository';
import { CurrentAssessment, FitnessAssessmentService } from '../calculations/fitness-assessment.service';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { CLOCK } from '../time/clock';
import { WorkoutHistoryService } from '../workout/workout-history.service';
import { FitnessReviewService } from './fitness-review.service';

// Synthetic data only. "Now" is Wednesday 14 October 2026; the default review is 5–11 October.
const NOW = new Date(2026, 9, 14, 9, 0);
const PROFILE: UserFitnessProfile = {
  primaryGoal: 'build-muscle',
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
  goalTarget: { targetWeight: null },
  updatedAt: '2026-10-01T09:00:00.000Z',
};
const TARGETS = { kind: 'ready', profile: {} as never, assessment: { targets: { calories: { finalKcal: 2400, status: 'normal' }, macros: { status: 'feasible', proteinGrams: 150, carbohydrateGrams: 280, fatGrams: 70 } } } as never } as CurrentAssessment;

const food = (date: string, overrides: Partial<FoodEntryInput> = {}) => {
  const r = createFoodEntry(
    { name: 'Rice bowl', quantity: 1, unit: 'serving', meal: 'lunch', calories: 600, proteinGrams: 30, carbohydrateGrams: 80, fatGrams: 15, ...overrides },
    { id: `f-${date}-${overrides.calories ?? 600}`, date, now: `${date}T12:00:00.000Z` },
  );
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
};
const weight = (date: string, kilograms: number): WeightEntry => ({ id: `w-${date}`, date, weight: { kilograms }, createdAt: `${date}T06:00:00.000Z`, updatedAt: `${date}T06:00:00.000Z` });
const tape = (date: string, waist: number): MeasurementEntry => ({ id: `m-${date}`, date, values: { waist: { centimeters: waist } }, createdAt: `${date}T06:00:00.000Z`, updatedAt: `${date}T06:00:00.000Z` });
const report = (date: string, bodyFat: number): BodyCompositionAssessment => ({
  id: `r-${date}`,
  date,
  source: MANUAL_INBODY_SOURCE,
  reported: { 'body-fat-percentage': { value: bodyFat, unit: '%' } },
  createdAt: `${date}T06:00:00.000Z`,
  updatedAt: `${date}T06:00:00.000Z`,
});

const KEYS = {
  profile: 'fitness.profile',
  logs: 'fitness.workout-logs',
  food: 'fitness.nutrition-entries',
  weights: 'fitness.body-weight-entries',
  measurements: 'fitness.body-measurement-entries',
  composition: 'fitness.body-composition-assessments',
};

function setup(options: { profile?: UserFitnessProfile | null; seed?: boolean } = {}) {
  const storage = new MemoryKeyValueStorage();
  const profile = options.profile === undefined ? PROFILE : options.profile;
  if (profile) {
    storage.values.set(KEYS.profile, JSON.stringify({ version: 2, profile }));
  }
  if (options.seed !== false) {
    const plan = planFor();
    const at = (day: number) => finishedLog({ plan, startedAt: new Date(2026, 9, day, 18, 0), minutes: 45 });
    storage.values.set(KEYS.logs, JSON.stringify({ version: 1, logs: [at(6), at(8), at(13)] }));
    storage.values.set(KEYS.food, JSON.stringify({ version: 1, entries: [food('2026-10-05', { proteinGrams: 60 }), food('2026-10-06', { proteinGrams: 60 }), food('2026-10-07', { proteinGrams: 60 })] }));
    storage.values.set(KEYS.weights, JSON.stringify({ version: 1, entries: [weight('2026-09-20', 81.4), weight('2026-10-10', 80.6)] }));
    storage.values.set(KEYS.measurements, JSON.stringify({ version: 1, entries: [tape('2026-09-20', 90), tape('2026-10-09', 89)] }));
    storage.values.set(KEYS.composition, JSON.stringify({ version: 1, assessments: [report('2026-09-01', 22.4), report('2026-10-07', 21.6)] }));
  }
  TestBed.configureTestingModule({
    providers: [
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => NOW },
      { provide: FitnessAssessmentService, useValue: { current: vi.fn().mockResolvedValue(profile ? TARGETS : { kind: 'no-profile' }) } },
    ],
  });
  return { storage, service: TestBed.inject(FitnessReviewService) };
}

describe('FitnessReviewService', () => {
  it('reviews the last complete Monday–Sunday week by default; a later week gives the current one', async () => {
    const { service } = setup();
    expect(service.defaultWeek()).toBe('2026-10-05');
    expect((await service.review()).review.weekStart).toBe('2026-10-05');
    expect((await service.review('2026-09-30')).review.weekStart).toBe('2026-09-28');
    expect((await service.review('2027-01-01')).review).toMatchObject({ weekStart: '2026-10-12', current: true });
  });

  it('builds every section from the app’s own records', async () => {
    const { service } = setup();
    const { review, unitSystem, targets } = await service.review();
    expect(unitSystem).toBe('metric');
    expect(targets).toMatchObject({ kind: 'available' });
    expect(review.training).toMatchObject({ kind: 'ready', completed: 2, planned: planFor().sessions.filter((s) => s.kind === 'resistance').length });
    expect(review.nutrition).toMatchObject({ kind: 'ready', loggedDays: 3, elapsedDays: 7, calorieTarget: 2400, proteinTarget: 150, average: { proteinGrams: 60 } });
    expect(review.body.weight).toMatchObject({ kind: 'ready', trend: { kind: 'change', change: -0.8 } });
    expect(review.body.measurements).toMatchObject({ kind: 'ready', changes: [{ site: 'waist', change: -1 }] });
    expect(review.body.composition).toMatchObject({ kind: 'ready', changes: [{ metric: 'body-fat-percentage', kind: 'change', change: -0.8 }] });
    expect(review.actions.map((a) => a.id)).toEqual(['complete-workouts', 'protein', 'log-food']);
  });

  it('without a profile: no plan or targets, so no actions that need them; records still reviewed', async () => {
    const { service } = setup({ profile: null });
    const { review, targets } = await service.review();
    expect(targets).toEqual({ kind: 'no-profile' });
    expect(review.training).toMatchObject({ kind: 'ready', completed: 2, planned: null });
    expect(review.nutrition).toMatchObject({ calorieTarget: null, proteinTarget: null });
    expect(review.actions.map((a) => a.id)).not.toContain('complete-workouts');
    expect(review.actions.map((a) => a.id)).not.toContain('protein');
  });

  it('a source that can’t be read leaves only its section unavailable', async () => {
    const { service } = setup();
    vi.spyOn(TestBed.inject(WeightHistoryRepository), 'list').mockRejectedValueOnce(new Error('storage'));
    vi.spyOn(TestBed.inject(WorkoutHistoryService), 'list').mockResolvedValueOnce({ ok: false });
    const { review } = await service.review();
    expect(review.body.weight).toEqual({ kind: 'unavailable' });
    expect(review.training).toEqual({ kind: 'unavailable' });
    expect(review.nutrition.kind).toBe('ready');
    expect(review.body.measurements.kind).toBe('ready');
  });

  it('an empty history gives an honest, mostly empty review', async () => {
    const { service } = setup({ seed: false });
    const { review } = await service.review();
    expect(review.training).toMatchObject({ completed: 0, trends: { trained: 0 } });
    expect(review.nutrition).toMatchObject({ loggedDays: 0, average: null });
    expect(review.body.weight).toMatchObject({ trend: { kind: 'insufficient', entries: 0 } });
    expect(review.body.composition).toMatchObject({ changes: [], reports: 0 });
  });

  it('is read-only: no record, profile or target is written', async () => {
    const { service, storage } = setup();
    const before = Object.fromEntries(Object.values(KEYS).map((k) => [k, storage.values.get(k)]));
    await service.review();
    await service.review('2026-09-28');
    for (const [key, value] of Object.entries(before)) {
      expect(storage.values.get(key)).toBe(value);
    }
  });
});
