import { calendarDateOf } from '../../domain/fitness-profile';
import { WorkoutLog, startWorkoutLog, trainingOverview, weeklyActivity } from '../../domain/workout-session';
import { finishedLog } from '../../domain/workout-session/testing/workout-log-fixtures';
import { ACTIVITY_PROFILE, PROFILE, REST_PROFILE, SUNDAY, THURSDAY, planFor } from '../workout/testing/workout-fixtures';
import { MUSCLE_AREAS } from '../workout/workout-content';
import { toWorkoutScreen } from '../workout/workout-view-model';
import { toHomeWeek, toHomeWorkout } from './home-training';

const ready = (profile = PROFILE) => ({ kind: 'ready' as const, plan: planFor(profile), origin: 'stored' as const, saved: true });
const screen = (profile = PROFILE, today = THURSDAY) => toWorkoutScreen(ready(profile), today);
const localDate = (instant: string) => calendarDateOf(new Date(instant));
const overviewOf = (logs: readonly WorkoutLog[], now: Date) => trainingOverview(logs, calendarDateOf(now), localDate);

describe('Home training summaries', () => {
  describe('today’s workout', () => {
    it('a training day shows the session the plan assigns to today, by its plan id', () => {
      const s = screen();
      const view = toHomeWorkout(s, null);
      if (s.kind !== 'ready' || s.today.session.kind !== 'resistance') {
        throw new Error('fixture: Thursday is a training day for the 4-day plan');
      }
      expect(view).toEqual({
        kind: 'resistance',
        sessionId: s.today.sessionId,
        title: s.today.session.title,
        descriptor: s.today.session.descriptor,
        countLabel: s.today.session.countLabel,
        durationLabel: s.today.session.durationLabel,
        minutes: s.today.session.estimatedMinutes,
        exercises: s.today.session.exercises.map((e) => e.name),
        focusAreas: [],
        setsTotal: null,
      });
      expect(s.today.session.exercises.length).toBeGreaterThan(0);
    });

    it('with the plan’s sessions: the body areas trained and the planned set count', () => {
      const plan = planFor(PROFILE);
      const s = screen();
      const view = toHomeWorkout(s, null, plan.sessions);
      if (s.kind !== 'ready' || view.kind !== 'resistance') {
        throw new Error('fixture: Thursday is a training day for the 4-day plan');
      }
      const session = plan.sessions.find((p) => p.id === view.sessionId);
      if (session?.kind !== 'resistance') {
        throw new Error('fixture: a resistance session');
      }
      expect(view.setsTotal).toBe(session.exercises.reduce((sum, e) => sum + e.sets, 0));
      expect(view.setsTotal).toBeGreaterThan(0);
      // The same areas Workout Detail shows for this session (no repeats, plan order).
      expect(view.focusAreas.length).toBeGreaterThan(0);
      expect(new Set(view.focusAreas).size).toBe(view.focusAreas.length);
      expect(view.focusAreas.every((a) => Object.values(MUSCLE_AREAS).includes(a))).toBe(true);
    });

    it('an activity day opens the activity, never a workout', () => {
      const view = toHomeWorkout(screen(ACTIVITY_PROFILE), null);
      expect(view).toMatchObject({ kind: 'activity', title: 'Light Activity' });
    });

    it('a rest day says so and names the next session', () => {
      const view = toHomeWorkout(screen(REST_PROFILE), null);
      expect(view).toEqual({
        kind: 'rest',
        message: 'Recovery is part of your plan. Rest, move gently and come back fresh.',
        upNext: expect.stringMatching(/^Next up: .+ on Friday\.$/),
      });
      expect(toHomeWorkout(screen(PROFILE, SUNDAY), null)).toMatchObject({ kind: 'rest', upNext: expect.stringContaining('on Monday') });
    });

    it('no profile or no plan is reported, not invented', () => {
      expect(toHomeWorkout({ kind: 'no-profile' }, null)).toEqual({ kind: 'no-profile' });
      expect(toHomeWorkout({ kind: 'unavailable' }, null)).toEqual({ kind: 'unavailable' });
    });

    it('a workout in progress comes first (even on a rest day or another session)', () => {
      const plan = planFor(PROFILE);
      const started = startWorkoutLog(plan, 'day-1-upper', { id: 'wl-1', startedAt: THURSDAY.toISOString(), weightUnit: 'kg' });
      if (!started.ok) {
        throw new Error('fixture');
      }
      expect(toHomeWorkout(screen(REST_PROFILE), started.value)).toEqual({
        kind: 'resume',
        sessionId: 'day-1-upper',
        title: 'Upper Body A',
        progress: '0 of 22 sets done',
        setsDone: 0,
        setsTotal: 22,
      });
      expect(toHomeWorkout({ kind: 'unavailable' }, started.value).kind).toBe('resume');
    });
  });

  describe('week strip', () => {
    const at = (day: number, hour = 18) => new Date(2026, 9, day, hour, 0);
    const weekOf = (logs: readonly WorkoutLog[], now: Date) => weeklyActivity(logs, calendarDateOf(now), localDate);

    it('lays the plan’s week over this week’s finished workouts', () => {
      const logs = [finishedLog({ startedAt: at(5), minutes: 50 }), finishedLog({ startedAt: at(6), minutes: 40 })]; // Mon, Tue
      const view = toHomeWeek(screen(), weekOf(logs, THURSDAY), overviewOf(logs, THURSDAY))!;
      // 4-day plan: Mon, Tue, Thu, Fri. Thursday 8 October is today.
      expect(view.days.map((d) => `${d.letter}${d.date}:${d.state}${d.isToday ? '*' : ''}`)).toEqual([
        'M5:done',
        'T6:done',
        'W7:rest',
        'T8:planned*',
        'F9:planned',
        'S10:rest',
        'S11:rest',
      ]);
      expect(view.countLabel).toBe('2 of 4 workouts');
      expect(view.accessibleLabel).toMatch(/^This week: 2 of 4 workouts done\. Today, Thursday: .+\.$/);
    });

    it('a rest day today is named as such', () => {
      const view = toHomeWeek(screen(PROFILE, SUNDAY), weekOf([], SUNDAY), overviewOf([], SUNDAY))!;
      expect(view.accessibleLabel).toContain('Today, Sunday: rest day.');
      expect(view.countLabel).toBe('0 of 4 workouts');
    });

    it('without a plan there is no week to show', () => {
      expect(toHomeWeek({ kind: 'no-profile' }, weekOf([], THURSDAY), overviewOf([], THURSDAY))).toBeNull();
    });
  });
});
