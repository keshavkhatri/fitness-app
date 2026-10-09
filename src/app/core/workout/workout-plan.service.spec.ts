import { TestBed } from '@angular/core/testing';

import { UserFitnessProfile } from '../../domain/fitness-profile';
import { DEFAULT_WORKOUT_CONFIG, WorkoutPlan } from '../../domain/workout-programming';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { CLOCK } from '../time/clock';
import { WorkoutPlanRepository } from './workout-plan.repository';
import { WorkoutPlanService, WorkoutPlanState } from './workout-plan.service';
import { WORKOUT_PROGRAMMING_CONFIG } from './workout-programming-config.token';

const PROFILE: UserFitnessProfile = {
  primaryGoal: 'build-muscle',
  dateOfBirth: '1990-06-15',
  sex: 'female',
  height: { centimeters: 168 },
  weight: { kilograms: 64 },
  unitSystem: 'metric',
  trainingExperience: 'beginner',
  trainingDaysPerWeek: 5,
  trainingLocation: 'gym',
  equipment: ['full-gym'],
  activityLevel: 'lightly-active',
  goalTarget: { targetWeight: null },
  updatedAt: '2026-10-01T09:00:00.000Z',
};

const KEY = 'fitness.workout-plan';

describe('WorkoutPlanService', () => {
  let storage: MemoryKeyValueStorage;
  let now: Date;

  function setup(providers: unknown[] = []) {
    TestBed.configureTestingModule({
      providers: [
        { provide: KeyValueStorage, useValue: storage },
        { provide: CLOCK, useValue: () => now },
        ...(providers as never[]),
      ],
    });
    return { service: TestBed.inject(WorkoutPlanService), profiles: TestBed.inject(FitnessProfileService) };
  }

  const ready = (state: WorkoutPlanState) => {
    if (state.kind !== 'ready') {
      throw new Error(`expected a ready plan, got ${state.kind}`);
    }
    return state;
  };
  const storedPlan = (): WorkoutPlan => JSON.parse(storage.values.get(KEY)!).plan;

  beforeEach(() => {
    storage = new MemoryKeyValueStorage();
    now = new Date(2026, 9, 8, 7, 30); // local 8 Oct 2026
  });

  it('reports no profile (and stores nothing) before onboarding', async () => {
    const { service } = setup();
    expect(await service.load()).toEqual({ kind: 'no-profile' });
    expect(service.plan()).toBeNull();
    expect(storage.values.has(KEY)).toBe(false);
  });

  it('creates, saves and exposes a v2 plan for the profile on first use', async () => {
    const { service, profiles } = setup();
    await profiles.save(PROFILE);

    const state = ready(await service.load());
    expect(state).toMatchObject({ origin: 'created', saved: true });
    expect(state.plan).toMatchObject({ workoutProgrammingVersion: 'v2', generatedAt: '2026-10-08', goal: 'build-muscle', daysPerWeek: 5 });
    // Beginner 5 days: three resistance sessions and two activity days.
    expect(state.plan.explanation.split).toMatchObject({ resistanceSessions: 3, activityDays: 2 });
    expect(service.plan()).toEqual(state.plan);
    expect(JSON.parse(storage.values.get(KEY)!)).toEqual({ version: 1, plan: state.plan });
  });

  it('reuses the stored plan in a later session (no regeneration, original date kept)', async () => {
    const first = setup();
    await first.profiles.save(PROFILE);
    const created = ready(await first.service.load()).plan;

    TestBed.resetTestingModule();
    now = new Date(2026, 10, 20);
    const { service } = setup();
    const state = ready(await service.load());
    expect(state).toMatchObject({ origin: 'stored', saved: true });
    expect(state.plan).toEqual(created);
    expect(state.plan.generatedAt).toBe('2026-10-08');
  });

  it('keeps the plan when a profile edit does not affect programming', async () => {
    const { service, profiles } = setup();
    await profiles.save(PROFILE);
    const created = ready(await service.load()).plan;

    await profiles.save({ ...PROFILE, weight: { kilograms: 62 }, updatedAt: '2026-10-09T08:00:00.000Z' });
    const state = ready(await service.load());
    expect(state.origin).toBe('stored');
    expect(state.plan).toBe(created);
  });

  it('regenerates and saves a new plan when programming inputs change', async () => {
    const { service, profiles } = setup();
    await profiles.save(PROFILE);
    const created = ready(await service.load()).plan;

    now = new Date(2026, 9, 12);
    await profiles.save({ ...PROFILE, trainingExperience: 'intermediate', trainingDaysPerWeek: 4 });
    const state = ready(await service.load());
    expect(state).toMatchObject({ origin: 'regenerated', saved: true });
    expect(state.plan.id).not.toBe(created.id);
    expect(state.plan).toMatchObject({ experience: 'intermediate', daysPerWeek: 4, generatedAt: '2026-10-12' });
    expect(state.plan.split.strategy).toBe('upper-lower');
    expect(storedPlan()).toEqual(state.plan);
  });

  it('regenerates when the stored plan belongs to a different profile setup', async () => {
    const first = setup();
    await first.profiles.save({ ...PROFILE, primaryGoal: 'get-stronger' });
    await first.service.load();

    TestBed.resetTestingModule();
    const { service, profiles } = setup();
    await profiles.save(PROFILE);
    expect(ready(await service.load())).toMatchObject({ origin: 'regenerated', plan: { goal: 'build-muscle' } });
  });

  it.each([
    ['corrupt JSON', '{not json'],
    ['an unknown envelope version', JSON.stringify({ version: 99, plan: {} })],
    ['an invalid plan', JSON.stringify({ version: 1, plan: { id: 'x' } })],
  ])('treats %s as no stored plan and replaces it', async (_, raw) => {
    storage.values.set(KEY, raw);
    const { service, profiles } = setup();
    await profiles.save(PROFILE);
    expect(ready(await service.load())).toMatchObject({ origin: 'created', saved: true });
    expect(storedPlan().workoutProgrammingVersion).toBe('v2');
  });

  it('still returns the plan when it cannot be saved, and regenerates the identical plan next time', async () => {
    const { service, profiles } = setup();
    await profiles.save(PROFILE);
    storage.failWrites = true;

    const unsaved = ready(await service.load());
    expect(unsaved).toMatchObject({ origin: 'created', saved: false });
    expect(storage.values.has(KEY)).toBe(false);

    TestBed.resetTestingModule();
    storage.failWrites = false;
    const next = setup();
    const again = ready(await next.service.load());
    expect(again).toMatchObject({ origin: 'created', saved: true });
    expect(again.plan).toEqual(unsaved.plan);
  });

  it('reports the engine error instead of a plan when the profile cannot be programmed', async () => {
    const { service, profiles } = setup();
    await profiles.save({ ...PROFILE, trainingDaysPerWeek: 7 as never });
    const state = await service.load();
    expect(state).toMatchObject({ kind: 'unavailable', error: { code: 'invalid-frequency' } });
    expect(service.plan()).toBeNull();
  });

  it('uses the injected workout programming configuration', async () => {
    const config = { ...DEFAULT_WORKOUT_CONFIG, version: 'v9' as never };
    const { service, profiles } = setup([{ provide: WORKOUT_PROGRAMMING_CONFIG, useValue: config }]);
    await profiles.save(PROFILE);
    expect(await service.load()).toMatchObject({ kind: 'unavailable', error: { code: 'invalid-configuration' } });
  });

  it('serializes concurrent loads: one plan, one save', async () => {
    const { service, profiles } = setup();
    await profiles.save(PROFILE);
    const repository = TestBed.inject(WorkoutPlanRepository);
    const save = vi.spyOn(repository, 'save');

    const [a, b, c] = await Promise.all([service.load(), service.load(), service.load()]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(ready(a).origin).toBe('created');
    expect(ready(b)).toMatchObject({ origin: 'stored', plan: ready(a).plan });
    expect(ready(c).plan).toBe(ready(a).plan);
  });

  it('falls back to generating a plan when the repository read fails', async () => {
    const { service, profiles } = setup();
    await profiles.save(PROFILE);
    const repository = TestBed.inject(WorkoutPlanRepository);
    const load = vi.spyOn(repository, 'load').mockRejectedValueOnce(new Error('disk'));

    expect(ready(await service.load()).origin).toBe('created');
    expect(load).toHaveBeenCalledTimes(1);
  });
});
