import { TestBed } from '@angular/core/testing';

import { UserFitnessProfile } from '../../domain/fitness-profile';
import { CustomPlanSpec, customSpecFromPlan } from '../../domain/training-plan';
import { WorkoutPlan, WorkoutSession } from '../../domain/workout-programming';
import { BILLING_PROVIDER } from '../entitlements/billing';
import { EntitlementService } from '../entitlements/entitlement.service';
import { PREMIUM_TEST_BILLING } from '../entitlements/testing/premium-billing';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { CLOCK } from '../time/clock';
import { WorkoutHistoryService } from './workout-history.service';
import { WorkoutLogService } from './workout-log.service';
import { PRIVATE_TESTING_CONFIG } from '../entitlements/private-testing/private-testing.config';
import { PrivateTestingService } from '../entitlements/private-testing/private-testing.service';
import { WorkoutPlanService, WorkoutPlanState } from './workout-plan.service';

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

const PLAN_KEY = 'fitness.workout-plan';

describe('custom workout plan: service, persistence, execution and history', () => {
  let storage: MemoryKeyValueStorage;
  let now: Date;

  function setup(premium: boolean) {
    TestBed.configureTestingModule({
      providers: [
        { provide: KeyValueStorage, useValue: storage },
        { provide: CLOCK, useValue: () => now },
        ...(premium ? [{ provide: BILLING_PROVIDER, useValue: PREMIUM_TEST_BILLING }] : []),
      ],
    });
    return {
      plans: TestBed.inject(WorkoutPlanService),
      profiles: TestBed.inject(FitnessProfileService),
      logs: TestBed.inject(WorkoutLogService),
      history: TestBed.inject(WorkoutHistoryService),
    };
  }
  /** A fresh app launch over the same device storage. */
  function relaunch(premium: boolean) {
    TestBed.resetTestingModule();
    return setup(premium);
  }

  const ready = (state: WorkoutPlanState) => {
    if (state.kind !== 'ready') {
      throw new Error(`expected a ready plan, got ${state.kind}`);
    }
    return state;
  };
  const resistance = (plan: WorkoutPlan) => plan.sessions.filter((s): s is WorkoutSession => s.kind === 'resistance');
  const storedPlan = (): WorkoutPlan => JSON.parse(storage.values.get(PLAN_KEY)!).plan;
  /** Every resistance day: bench press then a timed plank-style hold, so both logging modes are covered. */
  const spec = (plan: WorkoutPlan, ids = ['barbell-bench-press', 'plank']): CustomPlanSpec => ({
    days: resistance(plan).map((s) => ({
      sessionId: s.id,
      exercises: ids.map((id) =>
        id === 'plank'
          ? { exerciseId: id, sets: 2, target: { kind: 'time' as const, seconds: 40 }, restSeconds: 45 }
          : { exerciseId: id, sets: 2, target: { kind: 'reps' as const, min: 6, max: 8 }, restSeconds: 120 },
      ),
    })),
  });

  beforeEach(() => {
    storage = new MemoryKeyValueStorage();
    storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile: PROFILE }));
    now = new Date(2026, 9, 8, 9, 0);
  });

  describe('gating (no fake billing)', () => {
    it('without a billing provider (production today) saving a custom plan is refused and the plan is untouched', async () => {
      const { plans } = setup(false);
      const plan = ready(await plans.load()).plan;
      const before = storage.values.get(PLAN_KEY);

      expect(await plans.saveCustomPlan(spec(plan))).toEqual({ kind: 'not-allowed' });
      expect(storage.values.get(PLAN_KEY)).toBe(before);
      expect(ready(await plans.load()).plan.custom).toBeUndefined();
      expect(TestBed.inject(EntitlementService).plan()).toBe('free');
    });

    it('with a verified Premium entitlement (test provider) it is allowed', async () => {
      const { plans } = setup(true);
      const plan = ready(await plans.load()).plan;
      expect((await plans.saveCustomPlan(spec(plan))).kind).toBe('saved');
    });
  });

  describe('when Pro ends and comes back', () => {
    it('on Free the custom plan is set aside (not deleted) and the generated plan is active; with Pro again it is restored', async () => {
      const { plans } = setup(true);
      const generated = ready(await plans.load()).plan;
      expect((await plans.saveCustomPlan(spec(generated))).kind).toBe('saved');
      const custom = storedPlan();

      const free = relaunch(false);
      const onFree = ready(await free.plans.load()).plan;
      expect(onFree.custom).toBeUndefined();
      expect(onFree.id).toBe(generated.id);
      expect(storedPlan().custom).toBeUndefined();
      expect(JSON.parse(storage.values.get('fitness.workout-plan-parked')!).plan).toEqual(custom);

      const pro = relaunch(true);
      expect(ready(await pro.plans.load()).plan).toEqual(custom);
      expect(storedPlan()).toEqual(custom);
      expect(storage.values.has('fitness.workout-plan-parked')).toBe(false);
    });

    it('turning test access off while the app is open switches to the generated plan at once', async () => {
      const { plans } = setup(false);
      const testing = TestBed.inject(PrivateTestingService);
      expect(TestBed.inject(PRIVATE_TESTING_CONFIG).enabled).toBe(true);
      expect(await testing.redeem(TestBed.inject(PRIVATE_TESTING_CONFIG).promoCode!)).toBe('activated');
      const generated = ready(await plans.load()).plan;
      expect((await plans.saveCustomPlan(spec(generated))).kind).toBe('saved');
      TestBed.tick();
      expect(plans.plan()?.custom).toBeDefined();

      await testing.deactivate();
      await vi.waitFor(() => {
        TestBed.tick(); // effects in root services run on change detection
        expect(plans.plan()?.custom).toBeUndefined();
        expect(plans.plan()).not.toBeNull();
      });
      expect(plans.plan()?.id).toBe(generated.id);
    });

    it('if the custom plan cannot be set aside, the generated plan is used without overwriting it', async () => {
      const { plans } = setup(true);
      const generated = ready(await plans.load()).plan;
      expect((await plans.saveCustomPlan(spec(generated))).kind).toBe('saved');
      const custom = storage.values.get(PLAN_KEY);

      const free = relaunch(false);
      storage.failWrites = true;
      expect(ready(await free.plans.load()).plan.custom).toBeUndefined();
      storage.failWrites = false;
      expect(storage.values.get(PLAN_KEY)).toBe(custom);
    });
  });

  describe('saving and editing', () => {
    it('saves a validated custom plan as the active plan, in the existing plan storage, marked custom', async () => {
      const { plans } = setup(true);
      const generated = ready(await plans.load()).plan;
      const result = await plans.saveCustomPlan(spec(generated));
      expect(result.kind).toBe('saved');

      expect(storedPlan().custom).toEqual({ editedAt: '2026-10-08' });
      expect(storedPlan().id).toMatch(/^custom-/);
      expect(resistance(storedPlan())[0].exercises.map((e) => e.exerciseId)).toEqual(['barbell-bench-press', 'plank']);
      expect(plans.plan()).toEqual(storedPlan());
      const state = ready(await plans.load());
      expect(state).toMatchObject({ origin: 'stored', saved: true });
      expect(state.profileChanged).toBeFalsy();
    });

    it('reports an invalid plan without changing anything', async () => {
      const { plans } = setup(true);
      const plan = ready(await plans.load()).plan;
      const before = storage.values.get(PLAN_KEY);
      const broken = spec(plan);
      const result = await plans.saveCustomPlan({ days: [{ ...broken.days[0], exercises: [] }, ...broken.days.slice(1)] });
      expect(result).toMatchObject({ kind: 'invalid', issues: [{ code: 'empty-day' }] });
      expect(storage.values.get(PLAN_KEY)).toBe(before);
    });

    it('a failed write leaves the active plan as it was', async () => {
      const { plans } = setup(true);
      const plan = ready(await plans.load()).plan;
      const before = storage.values.get(PLAN_KEY);
      storage.failWrites = true;
      expect(await plans.saveCustomPlan(spec(plan))).toEqual({ kind: 'save-failed' });
      storage.failWrites = false;
      expect(storage.values.get(PLAN_KEY)).toBe(before);
      expect(ready(await plans.load()).plan.custom).toBeUndefined();
    });

    it('the active custom plan can be edited again: the edit starts from it and replaces it', async () => {
      const { plans } = setup(true);
      const first = (await plans.saveCustomPlan(spec(ready(await plans.load()).plan))) as { plan: WorkoutPlan };
      expect(customSpecFromPlan(first.plan).days[0].exercises.map((e) => e.exerciseId)).toEqual(['barbell-bench-press', 'plank']);

      now = new Date(2026, 9, 12, 9, 0);
      const second = await plans.saveCustomPlan(spec(first.plan, ['deadlift']));
      expect(second.kind).toBe('saved');
      expect(storedPlan().custom).toEqual({ editedAt: '2026-10-12' });
      expect(resistance(storedPlan())[0].exercises.map((e) => e.exerciseId)).toEqual(['deadlift']);
    });
  });

  describe('persistence across app restarts', () => {
    it('after a relaunch without Pro the generated plan is active and changing a custom plan is refused', async () => {
      const { plans } = setup(true);
      await plans.saveCustomPlan(spec(ready(await plans.load()).plan));
      const saved = storedPlan();

      const next = relaunch(false);
      const state = ready(await next.plans.load());
      expect(state.plan.custom).toBeUndefined();
      expect(await next.plans.saveCustomPlan(spec(state.plan, ['deadlift']))).toEqual({ kind: 'not-allowed' });
      expect(JSON.parse(storage.values.get('fitness.workout-plan-parked')!).plan).toEqual(saved);
    });

    it('a stored custom plan that no longer parses is replaced by a generated one rather than breaking the app', async () => {
      const { plans } = setup(true);
      await plans.saveCustomPlan(spec(ready(await plans.load()).plan));
      const stored = JSON.parse(storage.values.get(PLAN_KEY)!);
      stored.plan.custom = { editedAt: 'garbage' };
      storage.values.set(PLAN_KEY, JSON.stringify(stored));

      const next = relaunch(true);
      const state = ready(await next.plans.load());
      expect(state.plan.custom).toBeUndefined();
      expect(state.origin).toBe('created');
    });
  });

  describe('plan freshness', () => {
    it('unrelated profile changes never touch a custom plan', async () => {
      const { plans, profiles } = setup(true);
      await plans.saveCustomPlan(spec(ready(await plans.load()).plan));
      const saved = storedPlan();

      await profiles.save({ ...PROFILE, weight: { kilograms: 70 }, updatedAt: '2026-10-09T09:00:00.000Z' });
      const state = ready(await plans.load());
      expect(state.plan).toEqual(saved);
      expect(state.profileChanged).toBe(false);
      expect(storedPlan()).toEqual(saved);
    });

    it('changing the profile’s programming inputs keeps the custom plan and only reports it; switching is explicit', async () => {
      const { plans, profiles } = setup(true);
      await plans.saveCustomPlan(spec(ready(await plans.load()).plan));
      const saved = storedPlan();

      await profiles.save({ ...PROFILE, trainingDaysPerWeek: 3, updatedAt: '2026-10-09T09:00:00.000Z' });
      const state = ready(await plans.load());
      expect(state).toMatchObject({ origin: 'stored', profileChanged: true });
      expect(state.plan).toEqual(saved);

      // The deliberate way back: a generated plan from the profile as it is now.
      expect(await plans.useGeneratedPlan()).toBe('switched');
      const fresh = ready(await plans.load());
      expect(fresh.plan.custom).toBeUndefined();
      expect(fresh.plan.daysPerWeek).toBe(3);
      expect(storedPlan().custom).toBeUndefined();
    });

    it('switching back is not gated, and a failed write keeps the custom plan', async () => {
      const { plans } = setup(true);
      await plans.saveCustomPlan(spec(ready(await plans.load()).plan));
      const saved = storedPlan();
      storage.failWrites = true;
      expect(await plans.useGeneratedPlan()).toBe('save-failed');
      storage.failWrites = false;
      expect(ready(await plans.load()).plan).toEqual(saved);

      const next = relaunch(false);
      await next.plans.load();
      expect(await next.plans.useGeneratedPlan()).toBe('switched');
    });
  });

  describe('workout execution and history use the existing systems', () => {
    it('runs a custom workout through the existing session flow and keeps history intact when the plan is edited later', async () => {
      const { plans, logs, history } = setup(true);
      const generated = ready(await plans.load()).plan;
      const saved = (await plans.saveCustomPlan(spec(generated))) as { plan: WorkoutPlan };
      const sessionId = resistance(saved.plan)[0].id;

      // Start: the log snapshots the user's own exercises and prescriptions.
      const started = await logs.start(sessionId);
      expect(started.kind).toBe('started');
      const log = logs.active()!;
      expect(log.source.planId).toBe(saved.plan.id);
      expect(log.exercises.map((e) => [e.exerciseId, e.logging, e.planned.sets])).toEqual([
        ['barbell-bench-press', 'weight-reps', 2],
        ['plank', 'duration', 2],
      ]);

      // Log sets: weight and reps for the lift, seconds for the timed hold.
      expect((await logs.completeSet({ exercise: 0, set: 0 }, { weight: 60, reps: 8 })).ok).toBe(true);
      expect((await logs.completeSet({ exercise: 0, set: 1 }, { weight: 60, reps: 7 })).ok).toBe(true);
      await logs.goToExercise(1);
      expect((await logs.completeSet({ exercise: 1, set: 0 }, { durationSeconds: 40 })).ok).toBe(true);
      expect((await logs.completeSet({ exercise: 1, set: 1 }, { durationSeconds: 35 })).ok).toBe(true);
      now = new Date(2026, 9, 8, 9, 40);
      const finished = await logs.finish();
      expect(finished.ok).toBe(true);

      // It is in the existing history.
      const listed = await history.list();
      expect(listed.ok && listed.workouts).toHaveLength(1);
      const record = listed.ok ? listed.workouts[0] : null;
      expect(record?.exercises.map((e) => e.exerciseId)).toEqual(['barbell-bench-press', 'plank']);
      const snapshot = JSON.stringify(record);

      // Edit the plan afterwards (different exercises, even a switch back to generated): history is untouched.
      await plans.saveCustomPlan(spec(saved.plan, ['deadlift']));
      const after = await history.list();
      expect(JSON.stringify(after.ok ? after.workouts[0] : null)).toBe(snapshot);
      expect(await plans.useGeneratedPlan()).toBe('switched');
      const afterSwitch = await history.list();
      expect(JSON.stringify(afterSwitch.ok ? afterSwitch.workouts[0] : null)).toBe(snapshot);
    });

    it('a workout in progress keeps its own snapshot when the plan is edited meanwhile', async () => {
      const { plans, logs } = setup(true);
      const saved = (await plans.saveCustomPlan(spec(ready(await plans.load()).plan))) as { plan: WorkoutPlan };
      await logs.start(resistance(saved.plan)[0].id);
      await plans.saveCustomPlan(spec(saved.plan, ['deadlift']));
      expect(logs.active()!.exercises.map((e) => e.exerciseId)).toEqual(['barbell-bench-press', 'plank']);
    });
  });
});
