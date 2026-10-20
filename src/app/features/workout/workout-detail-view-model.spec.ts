import { WorkoutPlanState } from '../../core/workout/workout-plan.service';
import { EXERCISE_LIBRARY, PlannedExercise, WorkoutPlan, WorkoutSession } from '../../domain/workout-programming';
import { ACTIVITY_PROFILE, HOME_PROFILE, PROFILE, THURSDAY, planFor, profileWith } from './testing/workout-fixtures';
import { ResistanceDetailView, WorkoutDetailScreen, restSessionId, toWorkoutDetailScreen } from './workout-detail-view-model';
import { formatRest, prescriptionStats } from './workout-formatting';

const ready = (plan: WorkoutPlan = planFor()): WorkoutPlanState => ({ kind: 'ready', plan, origin: 'stored', saved: true });
const detailOf = (screen: WorkoutDetailScreen) => {
  if (screen.kind !== 'ready') {
    throw new Error(`expected ready, got ${screen.kind}`);
  }
  return screen.detail;
};
const resistance = (screen: WorkoutDetailScreen): ResistanceDetailView => {
  const detail = detailOf(screen);
  if (detail.kind !== 'resistance') {
    throw new Error(`expected resistance, got ${detail.kind}`);
  }
  return detail;
};
const planned = (overrides: Partial<PlannedExercise>): PlannedExercise => ({
  ...(planFor().sessions[0] as WorkoutSession).exercises[0],
  ...overrides,
});

describe('workout detail view model', () => {
  describe('session lookup', () => {
    it('resolves a session by its plan id', () => {
      const plan = planFor();
      expect(plan.sessions.map((s) => s.id)).toEqual(['day-1-upper', 'day-2-lower', 'day-3-upper', 'day-4-lower']);
      expect(resistance(toWorkoutDetailScreen(ready(plan), 'day-3-upper', THURSDAY)).title).toBe('Upper Body B');
      expect(resistance(toWorkoutDetailScreen(ready(plan), 'day-1-upper', THURSDAY)).title).toBe('Upper Body A');
    });

    it('resolves by id even when two sessions have the same display name', () => {
      const plan = planFor();
      const [a, b, c, d] = plan.sessions as WorkoutSession[];
      const duplicated: WorkoutPlan = { ...plan, sessions: [a, b, { ...c, variant: 'A', name: 'Upper A' }, d] };
      const first = resistance(toWorkoutDetailScreen(ready(duplicated), 'day-1-upper', THURSDAY));
      const third = resistance(toWorkoutDetailScreen(ready(duplicated), 'day-3-upper', THURSDAY));
      expect(first.title).toBe(third.title);
      const names = (session: WorkoutSession) => session.exercises.map((e) => EXERCISE_LIBRARY.find((x) => x.id === e.exerciseId)!.name);
      expect(first.exercises.map((e) => e.name)).toEqual(names(a));
      expect(third.exercises.map((e) => e.name)).toEqual(names(c));
      expect(third.dayLabel).toBe('Thursday · Today');
      expect(first.dayLabel).toBe('Monday');
      expect(third.exercises.map((e) => e.name)).not.toEqual(first.exercises.map((e) => e.name));
    });

    it.each([
      ['an id that is not in the plan', 'day-9-upper'],
      ['a display name instead of an id', 'Upper Body B'],
      ['an empty id', ''],
      ['a rest id for a training day', restSessionId('mon')],
    ])('reports %s as not found', (_, id) => {
      expect(toWorkoutDetailScreen(ready(), id, THURSDAY)).toEqual({ kind: 'not-found' });
    });

    it('no profile → not found (there is no plan to show); unavailable plan → unavailable, without details', () => {
      expect(toWorkoutDetailScreen({ kind: 'no-profile' }, 'day-1-upper', THURSDAY)).toEqual({ kind: 'not-found' });
      expect(
        toWorkoutDetailScreen({ kind: 'unavailable', error: { code: 'invalid-configuration', message: 'internal' } }, 'day-1-upper', THURSDAY),
      ).toEqual({ kind: 'unavailable' });
    });

    it('rest days resolve defensively to a rest view (never a workout)', () => {
      expect(detailOf(toWorkoutDetailScreen(ready(), restSessionId('wed'), THURSDAY))).toEqual({
        kind: 'rest',
        dayLabel: 'Wednesday',
        photo: null,
        title: 'Rest day',
        message: 'Recovery is part of your plan. There is no workout scheduled for this day.',
      });
    });
  });

  describe('resistance session', () => {
    it('summarizes the session from plan data', () => {
      const detail = resistance(toWorkoutDetailScreen(ready(), 'day-3-upper', THURSDAY));
      expect(detail).toMatchObject({
        kind: 'resistance',
        dayLabel: 'Thursday · Today',
        title: 'Upper Body B',
        descriptor: 'Hypertrophy',
        countLabel: '7 exercises',
        durationLabel: 'About 50 min',
        focus: 'Chest · Back · Shoulders · Arms',
        focusAreas: ['Chest', 'Back', 'Shoulders', 'Arms'],
        minutes: 50,
        cta: { label: 'Start workout' },
      });
      expect(detail.cta.pendingMessage).toBeNull(); // resistance sessions really start (Active Workout)
    });

    it('lists every exercise in the exact programmed order with catalog names and metadata', () => {
      const plan = planFor();
      const session = plan.sessions[2] as WorkoutSession;
      const detail = resistance(toWorkoutDetailScreen(ready(plan), 'day-3-upper', THURSDAY));
      expect(detail.exercises.map((e) => e.order)).toEqual(session.exercises.map((e) => e.order));
      expect(detail.exercises[0]).toEqual({
        order: 1,
        exerciseId: 'barbell-bench-press',
        name: 'Bench Press',
        photo: 'assets/images/workouts/exercises/barbell-bench-press.webp',
        stats: [
          { value: '4', label: 'sets', spokenLabel: 'sets' },
          { value: '6–10', label: 'reps', spokenLabel: 'reps' },
          { value: '120 sec', label: 'rest', spokenLabel: 'rest' },
        ],
        prescription: '4 sets · 6–10 reps · 120 sec rest',
        brief: '4 sets · 6–10 reps',
        metadata: 'Chest · Barbell, bench, rack',
        substitution: null,
      });
    });

    it('marks bodyweight exercises and explains substitutions only when the plan reports one', () => {
      const plan = planFor(HOME_PROFILE);
      const id = plan.sessions[0].id;
      const detail = resistance(toWorkoutDetailScreen(ready(plan), id, THURSDAY));
      const substituted = detail.exercises.filter((e) => e.substitution);
      const flagged = (plan.sessions[0] as WorkoutSession).exercises.filter((e) => e.selection.substitute);
      expect(substituted).toHaveLength(flagged.length);
      expect(substituted[0]).toMatchObject({
        name: 'Prone Y Raise',
        substitution: { title: 'Modified exercise', message: 'A substitute chosen for your available equipment.' },
      });
      expect(detail.exercises[0].metadata).toBe('Quads · Glutes · Bodyweight');
      expect(JSON.stringify(detail)).not.toMatch(/scapular|objective|horizontal-pull/);
    });

    it('omits metadata it cannot derive (exercise missing from the catalog)', () => {
      const detail = resistance(toWorkoutDetailScreen(ready(), 'day-3-upper', THURSDAY, new Map()));
      expect(detail.exercises[0]).toMatchObject({ name: 'barbell-bench-press', metadata: null });
      expect(detail.focus).toBeNull();
    });

    describe('progression guidance (from the plan’s own rules)', () => {
      it('loaded exercises: one line with the plan’s load step', () => {
        const detail = resistance(toWorkoutDetailScreen(ready(), 'day-3-upper', THURSDAY));
        expect(detail.progression).toEqual([
          'Loaded exercises: once you complete every set at the top of the rep range, increase the load by about 5%.',
        ]);
        const beginner = planFor(profileWith({ trainingExperience: 'beginner' }));
        expect(resistance(toWorkoutDetailScreen(ready(beginner), beginner.sessions[0].id, THURSDAY)).progression[0]).toContain('about 2.5%');
      });

      it('bodyweight and timed exercises: thresholds and next chain step from the rule', () => {
        const plan = planFor(HOME_PROFILE);
        const detail = resistance(toWorkoutDetailScreen(ready(plan), plan.sessions[0].id, THURSDAY));
        expect(detail.progression).toContain('Push-Up: once you reach 20 reps on every set, move on to Decline Push-Up.');
        expect(detail.progression).toContain('Prone Y Raise: once you reach 20 reps on every set, move on to a harder variation.');
        expect(detail.progression).toContain('Mountain Climbers: add 5 sec each session, up to 60 sec.');
      });

      it('is empty when no exercise carries a progression rule the UI can phrase', () => {
        const plan = planFor();
        const session = plan.sessions[2] as WorkoutSession;
        const noRules = { ...plan, sessions: plan.sessions.map((s) => (s === session ? { ...session, exercises: [] } : s)) };
        expect(resistance(toWorkoutDetailScreen(ready(noRules), session.id, THURSDAY)).progression).toEqual([]);
      });
    });
  });

  describe('activity session', () => {
    it('is an activity, not a list of exercises', () => {
      const plan = planFor(ACTIVITY_PROFILE);
      expect(detailOf(toWorkoutDetailScreen(ready(plan), 'day-4-light-activity', THURSDAY))).toEqual({
        kind: 'activity',
        dayLabel: 'Thursday · Today',
        title: 'Light Activity',
        photo: 'assets/images/workouts/session-light-activity.webp',
        typeLabel: 'Recovery',
        durationLabel: '20–30 min',
        intensityLabel: 'Easy pace',
        suggestions: 'Walking, easy cycling or mobility work.',
        guidance: 'Keep the pace easy: you should be able to hold a conversation.',
        cta: {
          label: 'Start activity',
          pendingMessage: 'Activity tracking arrives in a later update. Nothing has been started or recorded.',
        },
      });
    });

    it('optional activity days say so', () => {
      const plan = planFor(profileWith({ trainingExperience: 'beginner', trainingDaysPerWeek: 6 }));
      expect(detailOf(toWorkoutDetailScreen(ready(plan), 'day-6-optional-conditioning', THURSDAY))).toMatchObject({
        title: 'Optional Conditioning',
        typeLabel: 'Optional',
        durationLabel: '15–20 min',
        dayLabel: 'Saturday',
      });
    });
  });

  describe('prescription formatting', () => {
    it.each<[string, Partial<PlannedExercise>, [string, string][]]>([
      ['rep range', { sets: 3, target: { kind: 'reps', min: 8, max: 12 }, restSeconds: 90, notes: [] }, [['3', 'sets'], ['8–12', 'reps'], ['90 sec', 'rest']]],
      ['fixed reps', { sets: 3, target: { kind: 'reps', min: 10, max: 10 }, restSeconds: 60, notes: [] }, [['3', 'sets'], ['10', 'reps'], ['60 sec', 'rest']]],
      ['per side', { sets: 3, target: { kind: 'reps', min: 10, max: 10 }, restSeconds: 60, notes: ['per-side'] }, [['3', 'sets'], ['10', 'reps / side'], ['60 sec', 'rest']]],
      ['timed', { sets: 3, target: { kind: 'time', seconds: 30 }, restSeconds: 45, notes: ['time-based'] }, [['3', 'sets'], ['30 sec', 'time'], ['45 sec', 'rest']]],
      ['timed per side', { sets: 2, target: { kind: 'time', seconds: 20 }, restSeconds: 30, notes: ['per-side'] }, [['2', 'sets'], ['20 sec', 'time / side'], ['30 sec', 'rest']]],
      ['single set', { sets: 1, target: { kind: 'reps', min: 12, max: 15 }, restSeconds: 60, notes: [] }, [['1', 'set'], ['12–15', 'reps'], ['60 sec', 'rest']]],
      ['no rest', { sets: 2, target: { kind: 'reps', min: 8, max: 10 }, restSeconds: 0, notes: [] }, [['2', 'sets'], ['8–10', 'reps']]],
    ])('%s', (_, overrides, expected) => {
      expect(prescriptionStats(planned(overrides)).map((s) => [s.value, s.label])).toEqual(expected);
    });

    it('speaks per-side clearly', () => {
      const stats = prescriptionStats(planned({ target: { kind: 'reps', min: 8, max: 12 }, notes: ['per-side'] }));
      expect(stats[1].spokenLabel).toBe('reps per side');
    });

    it('formats rest consistently and never as "0 sec"', () => {
      expect([60, 90, 120].map(formatRest)).toEqual(['60 sec', '90 sec', '120 sec']);
      expect(formatRest(0)).toBeNull();
    });
  });

  it('is deterministic and independent of the profile timestamp', () => {
    const a = toWorkoutDetailScreen(ready(planFor(PROFILE)), 'day-3-upper', THURSDAY);
    const b = toWorkoutDetailScreen(ready(planFor(profileWith({ updatedAt: '2027-01-01T00:00:00.000Z' }))), 'day-3-upper', THURSDAY);
    expect(a).toEqual(b);
  });
});
