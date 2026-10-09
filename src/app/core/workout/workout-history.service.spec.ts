import { TestBed } from '@angular/core/testing';

import { WorkoutLog } from '../../domain/workout-session';
import { GYM_PROFILE, finishedLog } from '../../domain/workout-session/testing/workout-log-fixtures';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { CLOCK } from '../time/clock';
import { WorkoutHistoryService } from './workout-history.service';
import { WorkoutLogRepository } from './workout-log.repository';
import { WorkoutLogService } from './workout-log.service';

const LOGS_KEY = 'fitness.workout-logs';
const local = (month: number, day: number, hour = 9) => new Date(2026, month - 1, day, hour, 0);

describe('WorkoutHistoryService', () => {
  let storage: MemoryKeyValueStorage;
  let now: Date;

  function setup(logs: readonly WorkoutLog[] = []) {
    storage = new MemoryKeyValueStorage();
    storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile: GYM_PROFILE }));
    if (logs.length) {
      storage.values.set(LOGS_KEY, JSON.stringify({ version: 1, logs }));
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: KeyValueStorage, useValue: storage },
        { provide: CLOCK, useValue: () => now },
      ],
    });
    return TestBed.inject(WorkoutHistoryService);
  }

  beforeEach(() => {
    now = local(10, 8, 20); // Thursday 8 Oct 2026, evening
  });

  const today = finishedLog({ startedAt: local(10, 8, 18), minutes: 45 });
  const monday = finishedLog({ startedAt: local(10, 5, 7), minutes: 40, complete: (e) => e < 4, skipRest: true });
  const lastWeek = finishedLog({ startedAt: local(10, 1), minutes: 50 });

  it('empty history', async () => {
    const service = setup();
    expect(await service.list()).toEqual({ ok: true, workouts: [] });
    expect(await service.hasHistory()).toBe(false);
    expect(await service.mostRecent()).toBeNull();
    expect(await service.overview()).toMatchObject({ workoutsCompleted: 0, workoutsThisWeek: 0, lastWorkout: null });
  });

  it('lists stored workouts newest first (storage order does not matter)', async () => {
    const service = setup([lastWeek, today, monday]);
    const result = await service.list();
    expect(result.ok && result.workouts.map((w) => w.id)).toEqual([today.id, monday.id, lastWeek.id]);
    expect(await service.hasHistory()).toBe(true);
    expect((await service.mostRecent())?.id).toBe(today.id);
  });

  it('looks up one workout by id', async () => {
    const service = setup([today, monday]);
    expect(await service.get(monday.id)).toEqual(monday);
    expect(await service.get('wl-unknown')).toBeNull();
  });

  it('weekly and monthly counts use the local calendar week of today', async () => {
    const service = setup([today, monday, lastWeek]);
    expect(await service.overview()).toMatchObject({ workoutsThisWeek: 2, workoutsThisMonth: 3, workoutsCompleted: 3 });
    now = local(10, 12); // next Monday
    expect((await service.overview())?.workoutsThisWeek).toBe(0);
  });

  it('exposes what Home will need: recent workout, last date, weekly count', async () => {
    const service = setup([today, monday]);
    const overview = await service.overview();
    expect(overview?.lastWorkout?.id).toBe(today.id);
    expect(overview?.lastWorkoutDate).toEqual({ year: 2026, month: 10, day: 8 });
    expect(overview?.workoutsThisWeek).toBe(2);
  });

  it('includes a workout just finished in this app session', async () => {
    const service = setup([lastWeek]);
    const logs = TestBed.inject(WorkoutLogService);
    now = local(10, 8, 9);
    await logs.start('day-1-upper');
    await logs.completeSet({ exercise: 0, set: 0 }, { weight: 60, reps: 8 });
    now = local(10, 8, 10);
    const finished = await logs.finish();
    const result = await service.list();
    expect(result.ok && result.workouts.map((w) => w.id)).toEqual([finished.ok ? finished.log.id : '', lastWeek.id]);
  });

  it('still shows a finished workout whose save failed, once', async () => {
    const service = setup([lastWeek]);
    const logs = TestBed.inject(WorkoutLogService);
    await logs.start('day-1-upper');
    storage.failWrites = true;
    const finished = await logs.finish();
    const result = await service.list();
    expect(result.ok && result.workouts.map((w) => w.id)).toEqual([finished.ok ? finished.log.id : '', lastWeek.id]);
  });

  it('a repository failure is reported without details', async () => {
    const service = setup([today]);
    vi.spyOn(TestBed.inject(WorkoutLogRepository), 'listCompleted').mockRejectedValue(new Error('disk on fire'));
    expect(await service.list()).toEqual({ ok: false });
    expect(await service.overview()).toBeNull();
    expect(await service.hasHistory()).toBe(false);
  });

  it('corrupt stored history reads as empty rather than crashing', async () => {
    const service = setup();
    storage.values.set(LOGS_KEY, '{oops');
    expect(await service.list()).toEqual({ ok: true, workouts: [] });
  });

  describe('progress', () => {
    it('returns overview, this week and performed exercises from one read', async () => {
      const service = setup([today, monday, lastWeek]);
      const listCompleted = vi.spyOn(TestBed.inject(WorkoutLogRepository), 'listCompleted');
      const result = await service.progress();
      expect(listCompleted).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.overview).toMatchObject({ workoutsThisWeek: 2, workoutsThisMonth: 3, workoutsCompleted: 3 });
      expect(result.week.map((d) => d.workouts)).toEqual([1, 0, 0, 1, 0, 0, 0]);
      expect(result.exercises[0].exerciseId).toBe('barbell-bench-press');
      expect(result.exercises[0].sessions.map((s) => s.workoutId)).toEqual([today.id, monday.id, lastWeek.id]);
    });

    it('empty history gives an empty week and no exercises', async () => {
      const result = await setup().progress();
      expect(result).toMatchObject({ ok: true, exercises: [], overview: { workoutsCompleted: 0 } });
      expect(result.ok && result.week.every((d) => d.workouts === 0)).toBe(true);
    });

    it('storage failure is reported without details', async () => {
      const service = setup([today]);
      vi.spyOn(TestBed.inject(WorkoutLogRepository), 'listCompleted').mockRejectedValue(new Error('disk'));
      expect(await service.progress()).toEqual({ ok: false });
      expect(await service.exercisePerformance('barbell-bench-press')).toBeNull();
    });

    it('looks up one exercise by id; unknown ids give null', async () => {
      const service = setup([today]);
      expect((await service.exercisePerformance('barbell-row'))?.exerciseName).toBe('Barbell Row');
      expect(await service.exercisePerformance('unknown-exercise')).toBeNull();
    });
  });

  it('exercise performance comes from the logs', async () => {
    const service = setup([today, lastWeek]);
    const perf = await service.exercisePerformance('barbell-bench-press');
    expect(perf?.sessions.map((s) => s.workoutId)).toEqual([today.id, lastWeek.id]);
  });
});
