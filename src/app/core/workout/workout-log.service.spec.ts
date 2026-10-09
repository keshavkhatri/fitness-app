import { TestBed } from '@angular/core/testing';

import { UserFitnessProfile } from '../../domain/fitness-profile';
import { WorkoutLog } from '../../domain/workout-session';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { CLOCK } from '../time/clock';
import { WorkoutLogRepository } from './workout-log.repository';
import { WorkoutLogService } from './workout-log.service';
import { WorkoutPlanService } from './workout-plan.service';

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

const ACTIVE_KEY = 'fitness.workout-active';
const LOGS_KEY = 'fitness.workout-logs';
const PLAN_KEY = 'fitness.workout-plan';

describe('WorkoutLogService', () => {
  let storage: MemoryKeyValueStorage;
  let now: Date;

  function setup(profile: UserFitnessProfile | null = PROFILE) {
    if (profile) {
      storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile }));
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: KeyValueStorage, useValue: storage },
        { provide: CLOCK, useValue: () => now },
      ],
    });
    return TestBed.inject(WorkoutLogService);
  }
  /** A fresh app session over the same device storage. */
  function restart() {
    TestBed.resetTestingModule();
    return setup(null);
  }
  const stored = (key: string) => JSON.parse(storage.values.get(key) ?? 'null');
  const minutesLater = (m: number) => {
    now = new Date(now.getTime() + m * 60_000);
  };

  beforeEach(() => {
    storage = new MemoryKeyValueStorage();
    now = new Date('2026-10-08T09:00:00.000Z');
  });

  describe('starting', () => {
    it('starts a planned session from the current plan, saves it and exposes it', async () => {
      const service = setup();
      const result = await service.start('day-1-upper');
      expect(result.kind).toBe('started');
      const log = service.active()!;
      expect(log).toMatchObject({ id: 'wl-1791450000000-day-1-upper', status: 'in-progress', weightUnit: 'kg', startedAt: '2026-10-08T09:00:00.000Z' });
      expect(log.source.planId).toBe(stored(PLAN_KEY).plan.id);
      expect(stored(ACTIVE_KEY)).toEqual({ version: 1, log });
    });

    it('records weights in pounds for imperial profiles', async () => {
      const service = setup({ ...PROFILE, unitSystem: 'imperial' });
      await service.start('day-1-upper');
      expect(service.active()?.weightUnit).toBe('lb');
    });

    it('does not regenerate or modify the stored plan', async () => {
      const service = setup();
      const plan = await TestBed.inject(WorkoutPlanService).load();
      const before = storage.values.get(PLAN_KEY);
      const save = vi.spyOn(TestBed.inject(WorkoutPlanService), 'load');
      await service.start('day-1-upper');
      await service.completeSet({ exercise: 0, set: 0 }, { weight: 60, reps: 8 });
      await service.finish();
      expect(storage.values.get(PLAN_KEY)).toBe(before);
      expect(save).toHaveBeenCalledTimes(1); // read once, to start
      expect(plan.kind).toBe('ready');
    });

    it('resumes the same session instead of starting a second one', async () => {
      const service = setup();
      const first = await service.start('day-1-upper');
      const again = await service.start('day-1-upper');
      expect(again).toEqual({ kind: 'resumed', log: first.kind === 'started' ? first.log : null });
    });

    it('only one active workout: a different session reports a conflict and changes nothing', async () => {
      const service = setup();
      await service.start('day-1-upper');
      const before = storage.values.get(ACTIVE_KEY);
      const result = await service.start('day-3-upper');
      expect(result).toMatchObject({ kind: 'conflict', active: { source: { sessionId: 'day-1-upper' } } });
      expect(storage.values.get(ACTIVE_KEY)).toBe(before);
    });

    it('can explicitly replace the active workout', async () => {
      const service = setup();
      await service.start('day-1-upper');
      const result = await service.start('day-3-upper', { replaceActive: true });
      expect(result.kind).toBe('started');
      expect(service.active()?.source.sessionId).toBe('day-3-upper');
      expect(stored(ACTIVE_KEY).log.source.sessionId).toBe('day-3-upper');
    });

    it.each([
      ['an unknown session', 'day-9-upper'],
      ['an activity day', 'day-2-light-activity'],
    ])('reports %s as unavailable', async (_, id) => {
      const service = setup({ ...PROFILE, trainingExperience: 'beginner', trainingDaysPerWeek: 5 });
      expect(await service.start(id)).toEqual({ kind: 'unavailable' });
      expect(service.active()).toBeNull();
    });

    it('without a profile there is nothing to start', async () => {
      const service = setup(null);
      expect(await service.start('day-1-upper')).toEqual({ kind: 'unavailable' });
    });
  });

  describe('logging', () => {
    it('records completed, skipped and reset sets, saving after every change', async () => {
      const service = setup();
      await service.start('day-1-upper');
      minutesLater(3);
      const done = await service.completeSet({ exercise: 0, set: 0 }, { weight: 60, reps: 8 });
      expect(done.ok).toBe(true);
      expect(stored(ACTIVE_KEY).log.exercises[0].sets[0]).toMatchObject({ status: 'completed', weight: 60, reps: 8, completedAt: '2026-10-08T09:03:00.000Z' });

      await service.skipSet({ exercise: 0, set: 1 });
      expect(stored(ACTIVE_KEY).log.exercises[0].sets[1].status).toBe('skipped');
      await service.resetSet({ exercise: 0, set: 1 });
      expect(stored(ACTIVE_KEY).log.exercises[0].sets[1].status).toBe('pending');

      await service.skipExercise(1);
      await service.goToExercise(2);
      expect(stored(ACTIVE_KEY).log).toMatchObject({ currentExerciseIndex: 2 });
      expect(stored(ACTIVE_KEY).log.exercises[1].sets.every((s: { status: string }) => s.status === 'skipped')).toBe(true);
    });

    it('returns validation errors without changing or saving anything', async () => {
      const service = setup();
      await service.start('day-1-upper');
      const before = storage.values.get(ACTIVE_KEY);
      const result = await service.completeSet({ exercise: 0, set: 0 }, { reps: 8 });
      expect(result).toMatchObject({ ok: false, error: { code: 'invalid-entry', field: 'weight' } });
      expect(storage.values.get(ACTIVE_KEY)).toBe(before);
      expect(service.active()?.exercises[0].sets[0].status).toBe('pending');
    });

    it('serializes concurrent updates: none is lost', async () => {
      const service = setup();
      await service.start('day-1-upper');
      await Promise.all([
        service.completeSet({ exercise: 0, set: 0 }, { weight: 60, reps: 8 }),
        service.completeSet({ exercise: 0, set: 1 }, { weight: 60, reps: 8 }),
        service.skipSet({ exercise: 0, set: 2 }),
        service.completeSet({ exercise: 1, set: 0 }, { weight: 50, reps: 10 }),
      ]);
      const log: WorkoutLog = stored(ACTIVE_KEY).log;
      expect(log.exercises[0].sets.map((s) => s.status)).toEqual(['completed', 'completed', 'skipped', 'pending']);
      expect(log.exercises[1].sets[0].status).toBe('completed');
      expect(service.active()).toEqual(log);
    });

    it('updates without an active workout are refused', async () => {
      const service = setup();
      expect(await service.completeSet({ exercise: 0, set: 0 }, { weight: 1, reps: 1 })).toMatchObject({
        ok: false,
        error: { code: 'workout-not-in-progress' },
      });
    });
  });

  describe('interruption and recovery', () => {
    it('recovers the in-progress workout after the app is closed, exactly where it was', async () => {
      const first = setup();
      await first.start('day-1-upper');
      await first.completeSet({ exercise: 0, set: 0 }, { weight: 60, reps: 8 });
      await first.goToExercise(1);
      const before = first.active();

      const second = restart();
      expect(second.active()).toBeNull();
      expect(await second.loadActive()).toEqual(before);
      expect(second.active()?.currentExerciseIndex).toBe(1);
    });

    it('treats corrupt or unknown stored data as no active workout', async () => {
      storage.values.set(ACTIVE_KEY, '{nope');
      const service = setup();
      expect(await service.loadActive()).toBeNull();
      storage.values.set(ACTIVE_KEY, JSON.stringify({ version: 1, log: { id: 'x' } }));
      expect(await restart().loadActive()).toBeNull();
    });

    it('a failed read is not cached', async () => {
      const service = setup();
      vi.spyOn(TestBed.inject(WorkoutLogRepository), 'loadActive').mockRejectedValueOnce(new Error('disk'));
      expect(await service.loadActive()).toBeNull();
      await service.start('day-1-upper');
      expect(service.active()).not.toBeNull();
    });

    it('a plan regenerated mid-workout does not change the active workout', async () => {
      const service = setup();
      await service.start('day-1-upper');
      const before = service.active();
      // Profile change → the plan service regenerates the plan.
      await TestBed.inject(FitnessProfileService).save({ ...PROFILE, primaryGoal: 'get-stronger' });
      const plan = await TestBed.inject(WorkoutPlanService).load();
      expect(plan.kind === 'ready' && plan.plan.id).not.toBe(before?.source.planId);

      await service.completeSet({ exercise: 0, set: 0 }, { weight: 60, reps: 8 });
      expect(service.active()?.source).toEqual(before?.source);
      expect(service.active()?.exercises.map((e) => e.exerciseId)).toEqual(before?.exercises.map((e) => e.exerciseId));
    });
  });

  describe('failed storage', () => {
    it('keeps the workout going in memory and flags that it is not saved', async () => {
      const service = setup();
      await service.start('day-1-upper');
      storage.failWrites = true;
      const result = await service.completeSet({ exercise: 0, set: 0 }, { weight: 60, reps: 8 });
      expect(result.ok).toBe(true);
      expect(service.active()?.exercises[0].sets[0].status).toBe('completed');
      expect(service.saveFailed()).toBe(true);

      storage.failWrites = false;
      await service.completeSet({ exercise: 0, set: 1 }, { weight: 60, reps: 8 });
      expect(service.saveFailed()).toBe(false);
      expect(stored(ACTIVE_KEY).log.exercises[0].sets.slice(0, 2).every((s: { status: string }) => s.status === 'completed')).toBe(true);
    });

    it('a finished workout that could not be saved is still available for its summary', async () => {
      const service = setup();
      await service.start('day-1-upper');
      storage.failWrites = true;
      const result = await service.finish();
      expect(result.ok).toBe(true);
      const id = result.ok ? result.log.id : '';
      expect(await service.loadCompleted(id)).toMatchObject({ id, status: 'completed' });
      expect(service.saveFailed()).toBe(true);
    });
  });

  describe('finishing and discarding', () => {
    it('finishes: completed, stored with finished workouts, active slot cleared', async () => {
      const service = setup();
      await service.start('day-1-upper');
      await service.completeSet({ exercise: 0, set: 0 }, { weight: 60, reps: 8 });
      minutesLater(42);
      const result = await service.finish();
      expect(result).toMatchObject({ ok: true, log: { status: 'completed', completedAt: '2026-10-08T09:42:00.000Z' } });
      expect(service.active()).toBeNull();
      expect(storage.values.has(ACTIVE_KEY)).toBe(false);
      expect(stored(LOGS_KEY).logs).toHaveLength(1);

      const later = restart();
      expect(await later.loadActive()).toBeNull();
      expect(await later.loadCompleted(result.ok ? result.log.id : '')).toMatchObject({ status: 'completed' });
      expect(await later.loadCompleted('nope')).toBeNull();
    });

    it('keeps every finished workout (ready for history later)', async () => {
      const service = setup();
      await service.start('day-1-upper');
      await service.finish();
      minutesLater(60 * 24);
      await service.start('day-1-upper');
      await service.finish();
      expect(stored(LOGS_KEY).logs.map((l: WorkoutLog) => l.source.sessionId)).toEqual(['day-1-upper', 'day-1-upper']);
    });

    it('discards the active workout without keeping it', async () => {
      const service = setup();
      await service.start('day-1-upper');
      await service.discard();
      expect(service.active()).toBeNull();
      expect(storage.values.has(ACTIVE_KEY)).toBe(false);
      expect(storage.values.has(LOGS_KEY)).toBe(false);
      expect((await service.start('day-3-upper')).kind).toBe('started');
    });
  });
});
