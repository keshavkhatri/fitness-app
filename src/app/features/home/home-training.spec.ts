import { calendarDateOf } from '../../domain/fitness-profile';
import { WorkoutLog, startWorkoutLog, trainingOverview } from '../../domain/workout-session';
import { finishedLog } from '../../domain/workout-session/testing/workout-log-fixtures';
import { ACTIVITY_PROFILE, PROFILE, REST_PROFILE, SUNDAY, THURSDAY, planFor } from '../workout/testing/workout-fixtures';
import { toWorkoutScreen } from '../workout/workout-view-model';
import { toHomeProgress, toHomeWorkout } from './home-training';

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
      });
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
      });
      expect(toHomeWorkout({ kind: 'unavailable' }, started.value).kind).toBe('resume');
    });
  });

  describe('progress', () => {
    const at = (day: number, hour = 18) => new Date(2026, 9, day, hour, 0);

    it('counts this Monday–Sunday week and shows the latest workout', () => {
      const logs = [
        finishedLog({ startedAt: at(4, 10), minutes: 40 }), // Sunday: previous week
        finishedLog({ startedAt: at(5), minutes: 50 }), // Monday
        finishedLog({ startedAt: at(7), minutes: 45 }), // Wednesday (latest)
      ];
      const view = toHomeProgress(overviewOf(logs, THURSDAY), THURSDAY);
      expect(view).toMatchObject({ kind: 'ready', thisWeek: { count: 2, unit: 'workouts' } });
      if (view.kind !== 'ready') {
        throw new Error(view.kind);
      }
      expect(view.lastWorkout).toMatchObject({ id: logs[2].id, meta: 'Yesterday · 45 min', statusLabel: 'Completed' });
    });

    it('a new week starts on Monday: nothing yet this week, but the last workout is still shown', () => {
      const logs = [finishedLog({ startedAt: at(11), minutes: 40 })]; // Sunday 11 Oct
      const monday = new Date(2026, 9, 12, 8, 0);
      expect(toHomeProgress(overviewOf(logs, monday), monday)).toMatchObject({ kind: 'ready', thisWeek: { count: 0, unit: 'workouts' } });
      expect(toHomeProgress(overviewOf(logs, SUNDAY), SUNDAY)).toMatchObject({ thisWeek: { count: 1, unit: 'workout' } });
    });

    it('no finished workouts: empty, nothing fabricated', () => {
      expect(toHomeProgress(overviewOf([], THURSDAY), THURSDAY)).toEqual({ kind: 'empty' });
    });

    it('history that can’t be read is an error', () => {
      expect(toHomeProgress(null, THURSDAY)).toEqual({ kind: 'error' });
    });
  });
});
