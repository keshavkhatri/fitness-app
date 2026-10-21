import { WorkoutPlanState } from '../../../core/workout/workout-plan.service';
import { WorkoutPlan } from '../../../domain/workout-programming';
import { startWorkoutLog } from '../../../domain/workout-session';
import { finishedLog } from '../../../domain/workout-session/testing/workout-log-fixtures';
import { REST_PROFILE, THURSDAY, planFor } from '../testing/workout-fixtures';
import { WorkoutScreen, toWorkoutScreen } from '../workout-view-model';
import { toPlanTab } from './plan-view-model';

const ready = (plan: WorkoutPlan): WorkoutPlanState => ({ kind: 'ready', plan, origin: 'stored', saved: true });
const screenFor = (plan: WorkoutPlan, today = THURSDAY) => toWorkoutScreen(ready(plan), today) as Extract<WorkoutScreen, { kind: 'ready' }>;
const at = (day: number, hour = 18) => new Date(2026, 9, day, hour, 0);

describe('plan tab view model', () => {
  const plan = planFor();
  const screen = screenFor(plan);

  it('dates the week Monday first, in local time, with today and the day types', () => {
    const view = toPlanTab(screen, plan.sessions, [], null, THURSDAY);
    expect(view.todayLabel).toBe('Thursday, 8 Oct');
    expect(view.days.map((d) => `${d.letter}${d.date}:${d.state}${d.isToday ? '*' : ''}`)).toEqual([
      'M5:training',
      'T6:training',
      'W7:rest',
      'T8:training*',
      'F9:training',
      'S10:rest',
      'S11:rest',
    ]);
    expect(view.days[2].sessionId).toBeNull();
  });

  it('a week across months still dates each day correctly', () => {
    const view = toPlanTab(screenFor(plan, new Date(2026, 9, 1, 9)), plan.sessions, [], null, new Date(2026, 9, 1, 9));
    expect(view.days.map((d) => d.date)).toEqual(['28', '29', '30', '1', '2', '3', '4']);
  });

  it('only this week’s finished training counts as done (not last week, not a workout with no set done)', () => {
    const history = [
      finishedLog({ plan, sessionId: 'day-1-upper', startedAt: at(5), minutes: 50 }),
      // Last week's Tuesday: not this week's.
      finishedLog({ plan, sessionId: 'day-2-lower', startedAt: new Date(2026, 8, 29, 18), minutes: 45 }),
      // Finished with nothing done: not training.
      finishedLog({ plan, sessionId: 'day-4-lower', startedAt: at(6), minutes: 5, complete: () => false, skipRest: true }),
    ];
    const view = toPlanTab(screen, plan.sessions, history, null, THURSDAY);
    expect(view.rows.map((r) => [r.title, r.status])).toEqual([
      ['Upper Body A', 'done'],
      ['Lower Body A', 'missed'],
      ['Upper Body B', 'upcoming'],
      ['Lower Body B', 'upcoming'],
    ]);
    expect(view.days[0].state).toBe('done');
    expect(view.days[1].state).toBe('training');
    expect(view.weekProgress).toBe('1 of 4 done');
  });

  it('the workout in progress is resumed first, and marked on its row', () => {
    const started = startWorkoutLog(plan, 'day-2-lower', { id: 'wl-a', startedAt: at(8, 8).toISOString(), weightUnit: 'kg' });
    if (!started.ok) {
      throw new Error(started.error.message);
    }
    const view = toPlanTab(screen, plan.sessions, [], started.value, THURSDAY);
    expect(view.feature).toMatchObject({ kind: 'resume', sessionId: 'day-2-lower', title: 'Lower Body A', setsDone: 0 });
    expect(view.rows[1]).toMatchObject({ status: 'in-progress', statusLabel: 'In progress' });
  });

  it('today: start with the plan’s length and up to three focus areas; done once finished this week', () => {
    expect(toPlanTab(screen, plan.sessions, [], null, THURSDAY).feature).toEqual({
      kind: 'start',
      sessionId: 'day-3-upper',
      photo: 'assets/images/workouts/session-upper.webp',
      title: 'Upper Body B',
      minutes: 50,
      countLabel: '7 exercises',
      areas: ['Chest', 'Back', 'Shoulders'],
    });
    const done = finishedLog({ plan, sessionId: 'day-3-upper', startedAt: at(8, 7), minutes: 50 });
    expect(toPlanTab(screen, plan.sessions, [done], null, THURSDAY).feature).toMatchObject({ kind: 'done', workoutId: done.id });
  });

  it('rest day: what comes next, if anything', () => {
    const rest = planFor(REST_PROFILE);
    const view = toPlanTab(screenFor(rest), rest.sessions, [], null, THURSDAY);
    expect(view.feature).toEqual({ kind: 'rest', photo: 'assets/images/workouts/rest-day.webp', upNext: 'Next up: Full Body C on Friday.' });
  });

  it('without the plan’s sessions there are no focus areas (never invented)', () => {
    const view = toPlanTab(screen, [], [], null, THURSDAY);
    expect(view.feature).toMatchObject({ kind: 'start', areas: [] });
  });
});
