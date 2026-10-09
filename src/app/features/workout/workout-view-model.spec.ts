import { WorkoutPlanState } from '../../core/workout/workout-plan.service';
import { EXERCISE_LIBRARY, PlannedExercise, WorkoutFrequency } from '../../domain/workout-programming';
import {
  ACTIVITY_PROFILE,
  HOME_PROFILE,
  MONDAY,
  PROFILE,
  REST_PROFILE,
  SATURDAY,
  SUNDAY,
  THURSDAY,
  planFor,
  profileWith,
} from './testing/workout-fixtures';
import { formatMinuteRange, formatMinutes, formatPrescription } from './workout-formatting';
import { WEEKLY_LAYOUT, WorkoutScreen, scheduleWeek, toWorkoutScreen, weekdayIndexOf } from './workout-view-model';

const ready = (plan = planFor(), extra: Partial<Extract<WorkoutPlanState, { kind: 'ready' }>> = {}): WorkoutPlanState => ({
  kind: 'ready',
  plan,
  origin: 'stored',
  saved: true,
  ...extra,
});
const readyScreen = (screen: WorkoutScreen) => {
  if (screen.kind !== 'ready') {
    throw new Error(`expected ready, got ${screen.kind}`);
  }
  return screen;
};
const exercise = (overrides: Partial<PlannedExercise>): PlannedExercise => ({
  ...planFor().sessions.find((s) => s.kind === 'resistance')!.exercises[0],
  ...overrides,
});

describe('workout view model', () => {
  describe('states', () => {
    it('maps no-profile and unavailable without exposing engine details', () => {
      expect(toWorkoutScreen({ kind: 'no-profile' }, THURSDAY)).toEqual({ kind: 'no-profile' });
      expect(
        toWorkoutScreen({ kind: 'unavailable', error: { code: 'invalid-frequency', message: 'internal detail' } }, THURSDAY),
      ).toEqual({ kind: 'unavailable' });
    });
  });

  describe('weekly schedule', () => {
    it('weekday index is Monday-first in local time', () => {
      expect([MONDAY, THURSDAY, SATURDAY, SUNDAY].map(weekdayIndexOf)).toEqual([0, 3, 5, 6]);
    });

    it.each<[WorkoutFrequency, string[]]>([
      [2, ['Mon', 'Thu']],
      [3, ['Mon', 'Wed', 'Fri']],
      [4, ['Mon', 'Tue', 'Thu', 'Fri']],
      [5, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']],
      [6, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']],
    ])('%i days: training days on %j, every other day rest', (days, trainingDays) => {
      const screen = readyScreen(toWorkoutScreen(ready(planFor(profileWith({ trainingDaysPerWeek: days }))), THURSDAY));
      expect(screen.week.map((d) => d.shortWeekday)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
      expect(screen.week.filter((d) => d.session.kind !== 'rest').map((d) => d.shortWeekday)).toEqual(trainingDays);
      expect(WEEKLY_LAYOUT[days]).toHaveLength(days);
    });

    it('keeps the plan’s day order and invents no sessions', () => {
      const plan = planFor();
      const slots = scheduleWeek(plan);
      expect(slots.filter((s) => s !== null)).toEqual(plan.sessions);
      expect(slots.filter((s) => s === null)).toHaveLength(7 - plan.daysPerWeek);
      const screen = readyScreen(toWorkoutScreen(ready(plan), THURSDAY));
      expect(screen.week.map((d) => d.session.title)).toEqual([
        'Upper Body A', 'Lower Body A', 'Rest Day', 'Upper Body B', 'Lower Body B', 'Rest Day', 'Rest Day',
      ]);
    });

    it('beginner 5 days: workouts and activity days alternate, weekend rest', () => {
      const screen = readyScreen(toWorkoutScreen(ready(planFor(ACTIVITY_PROFILE)), THURSDAY));
      expect(screen.week.map((d) => d.session.kind)).toEqual([
        'resistance', 'activity', 'resistance', 'activity', 'resistance', 'rest', 'rest',
      ]);
    });

    it('carries each training day’s plan session id (the detail route key); rest days have none', () => {
      const plan = planFor();
      const screen = readyScreen(toWorkoutScreen(ready(plan), THURSDAY));
      expect(screen.week.map((d) => d.sessionId)).toEqual(['day-1-upper', 'day-2-lower', null, 'day-3-upper', 'day-4-lower', null, null]);
      expect(screen.week.filter((d) => d.sessionId).map((d) => d.sessionId)).toEqual(plan.sessions.map((s) => s.id));
    });

    it('marks exactly one day as today, with a spoken label', () => {
      const screen = readyScreen(toWorkoutScreen(ready(), THURSDAY));
      expect(screen.week.filter((d) => d.isToday).map((d) => d.weekday)).toEqual(['Thursday']);
      expect(screen.today.accessibleLabel).toBe('Thursday, today. Upper Body B. 7 exercises, about 50 minutes.');
      expect(screen.week[2].accessibleLabel).toBe('Wednesday. Rest day.');
    });
  });

  describe('today', () => {
    it('resistance day: title, descriptor, count, duration and exercises in programmed order', () => {
      const plan = planFor();
      const screen = readyScreen(toWorkoutScreen(ready(plan), THURSDAY));
      const today = screen.today.session;
      expect(today).toMatchObject({
        kind: 'resistance',
        title: 'Upper Body B',
        descriptor: 'Hypertrophy',
        countLabel: '7 exercises',
        durationLabel: 'About 50 min',
        summary: '7 exercises · ~50 min',
      });
      const session = plan.sessions[2];
      expect(today.kind === 'resistance' && today.exercises.map((e) => e.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(today.kind === 'resistance' && today.exercises.map((e) => e.name)).toEqual(
        session.exercises.map((e) => EXERCISE_LIBRARY.find((x) => x.id === e.exerciseId)!.name),
      );
      expect(today.kind === 'resistance' && today.exercises[0]).toEqual({
        order: 1,
        name: 'Bench Press',
        prescription: '4 sets · 6–10 reps · 120 sec rest',
        prescriptionParts: ['4 sets', '6–10 reps', '120 sec rest'],
        focus: 'Chest',
        note: null,
      });
    });

    it('activity day: not a workout; duration range, suggestions, guidance', () => {
      const screen = readyScreen(toWorkoutScreen(ready(planFor(ACTIVITY_PROFILE)), THURSDAY));
      expect(screen.today.session).toEqual({
        kind: 'activity',
        title: 'Light Activity',
        optional: false,
        durationMinutes: { min: 20, max: 30 },
        summary: 'Recovery · 20–30 min',
        suggestions: 'Walking, easy cycling or mobility work.',
        guidance: 'Keep the pace easy: you should be able to hold a conversation.',
      });
    });

    it('optional activity days say so', () => {
      const six = readyScreen(toWorkoutScreen(ready(planFor(profileWith({ trainingExperience: 'beginner', trainingDaysPerWeek: 6 }))), SATURDAY));
      expect(six.today.session).toMatchObject({ kind: 'activity', title: 'Optional Conditioning', optional: true, summary: 'Optional · 15–20 min' });
      expect(six.today.accessibleLabel).toBe('Saturday, today. Optional Conditioning. 15 to 20 minutes, optional.');
    });

    it('rest day: rest view and the next training day (wrapping into next week)', () => {
      const rest = readyScreen(toWorkoutScreen(ready(planFor(REST_PROFILE)), THURSDAY));
      expect(rest.today.session).toEqual({ kind: 'rest', title: 'Rest Day', summary: 'Rest' });
      expect(rest.upNext).toMatchObject({ weekday: 'Friday', session: { title: 'Full Body C' } });

      const weekend = readyScreen(toWorkoutScreen(ready(), SUNDAY));
      expect(weekend.today.session.kind).toBe('rest');
      expect(weekend.upNext).toMatchObject({ weekday: 'Monday', session: { title: 'Upper Body A' } });
    });

    it('flags substituted exercises honestly', () => {
      const screen = readyScreen(toWorkoutScreen(ready(planFor(HOME_PROFILE)), MONDAY));
      const session = screen.today.session;
      const notes = session.kind === 'resistance' ? session.exercises.filter((e) => e.note) : [];
      expect(notes.map((e) => e.name)).toEqual(['Prone Y Raise']);
      expect(notes[0].note).toBe('Closest option for your equipment');
    });

    it('falls back to the exercise id and no focus when an exercise is missing from the catalog', () => {
      const screen = readyScreen(toWorkoutScreen(ready(), THURSDAY, new Map()));
      const session = screen.today.session;
      expect(session.kind === 'resistance' && session.exercises[0]).toMatchObject({ name: 'barbell-bench-press', focus: null });
    });
  });

  describe('formatting', () => {
    it.each<[string, Partial<PlannedExercise>, string]>([
      ['rep range', { sets: 3, target: { kind: 'reps', min: 8, max: 12 }, restSeconds: 90, notes: [] }, '3 sets · 8–12 reps · 90 sec rest'],
      ['fixed reps', { sets: 5, target: { kind: 'reps', min: 5, max: 5 }, restSeconds: 180, notes: [] }, '5 sets · 5 reps · 180 sec rest'],
      ['one set', { sets: 1, target: { kind: 'reps', min: 10, max: 15 }, restSeconds: 60, notes: [] }, '1 set · 10–15 reps · 60 sec rest'],
      ['per side', { sets: 3, target: { kind: 'reps', min: 8, max: 12 }, restSeconds: 60, notes: ['per-side'] }, '3 sets · 8–12 reps per side · 60 sec rest'],
      ['timed', { sets: 3, target: { kind: 'time', seconds: 30 }, restSeconds: 45, notes: ['time-based'] }, '3 sets · 30 sec · 45 sec rest'],
      ['no rest', { sets: 2, target: { kind: 'time', seconds: 40 }, restSeconds: 0, notes: [] }, '2 sets · 40 sec'],
    ])('%s', (_, overrides, expected) => {
      expect(formatPrescription(exercise(overrides))).toBe(expected);
    });

    it('formats durations', () => {
      expect(formatMinutes(45)).toBe('~45 min');
      expect(formatMinuteRange({ min: 20, max: 30 })).toBe('20–30 min');
      expect(formatMinuteRange({ min: 20, max: 20 })).toBe('20 min');
    });
  });

  describe('plan facts and notices', () => {
    it('summarizes goal, days, experience and location', () => {
      const screen = readyScreen(toWorkoutScreen(ready(), THURSDAY));
      expect(screen.plan).toEqual([
        { label: 'Goal', value: 'Build muscle', detail: 'Hypertrophy' },
        { label: 'Training days', value: '4 days a week', detail: null },
        { label: 'Experience', value: 'Intermediate', detail: null },
        { label: 'Location', value: 'Gym', detail: null },
      ]);
    });

    it('distinguishes requested days from workouts and activity days', () => {
      const screen = readyScreen(toWorkoutScreen(ready(planFor(ACTIVITY_PROFILE)), THURSDAY));
      expect(screen.plan[1]).toEqual({ label: 'Training days', value: '5 days a week', detail: '3 workouts · 2 activity days' });
    });

    it('names combined locations naturally', () => {
      const screen = readyScreen(toWorkoutScreen(ready(planFor(profileWith({ trainingLocation: 'both' }))), THURSDAY));
      expect(screen.plan[3].value).toBe('Gym and home');
    });

    it('notices: none for a stored plan; regenerated and not-saved are reported, non-blocking', () => {
      expect(readyScreen(toWorkoutScreen(ready(), THURSDAY)).notices).toEqual([]);
      expect(readyScreen(toWorkoutScreen(ready(planFor(), { origin: 'created' }), THURSDAY)).notices).toEqual([]);
      const both = readyScreen(toWorkoutScreen(ready(planFor(), { origin: 'regenerated', saved: false }), THURSDAY));
      expect(both.notices.map((n) => [n.tone, n.title])).toEqual([
        ['info', 'Your plan was updated'],
        ['warning', "Your plan isn't saved on this device"],
      ]);
      expect(both.today.session.kind).toBe('resistance');
    });
  });

  it('is deterministic', () => {
    const plan = planFor(PROFILE);
    expect(toWorkoutScreen(ready(plan), THURSDAY)).toEqual(toWorkoutScreen(ready(structuredClone(plan)), THURSDAY));
  });
});
