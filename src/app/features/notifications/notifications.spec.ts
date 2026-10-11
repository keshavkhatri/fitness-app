import { HomeWorkoutView } from '../home/home-training';
import { NotificationFacts, buildNotifications } from './notifications';

const planned: HomeWorkoutView = {
  kind: 'resistance',
  sessionId: 'day-1-upper',
  title: 'Upper Body A',
  descriptor: 'Strength',
  countLabel: '7 exercises',
  durationLabel: 'About 45 min',
  minutes: 45,
  exercises: [],
  focusAreas: [],
  setsTotal: 22,
};
const facts = (f: Partial<NotificationFacts> = {}): NotificationFacts => ({
  today: '2026-10-08',
  workout: planned,
  trainedToday: false,
  recoveryCheckedIn: false,
  foodLogged: false,
  daysSinceWeighIn: null,
  ...f,
});
const kinds = (f: Partial<NotificationFacts> = {}) => buildNotifications(facts(f)).map((n) => n.action.kind);

describe('notification inbox (builder)', () => {
  it('reminds of today’s planned workout, the check-in, food and a weigh-in, most relevant first', () => {
    expect(kinds()).toEqual(['open-session', 'recovery-check-in', 'log-food', 'log-weight']);
    expect(buildNotifications(facts())[0]).toMatchObject({ title: 'Upper Body A is planned today', message: '7 exercises · About 45 min' });
  });

  it('a workout in progress replaces the plan reminder', () => {
    const resume: HomeWorkoutView = { kind: 'resume', sessionId: 'day-1-upper', title: 'Upper Body A', progress: '3 of 22 sets done', setsDone: 3, setsTotal: 22 };
    expect(buildNotifications(facts({ workout: resume }))[0]).toMatchObject({ title: 'Workout in progress', action: { kind: 'resume', sessionId: 'day-1-upper' } });
  });

  it('nothing to remind about once it is done', () => {
    expect(kinds({ trainedToday: true, recoveryCheckedIn: true, foodLogged: true, daysSinceWeighIn: 2 })).toEqual([]);
    expect(kinds({ workout: { kind: 'rest', message: '', upNext: null }, recoveryCheckedIn: true, foodLogged: true, daysSinceWeighIn: 0 })).toEqual([]);
  });

  it('asks for a weigh-in after a week without one', () => {
    expect(buildNotifications(facts({ daysSinceWeighIn: 9 })).at(-1)?.message).toBe('Your last weigh-in was 9 days ago.');
    expect(kinds({ daysSinceWeighIn: 6 })).not.toContain('log-weight');
  });

  it('ids are stable for the day, so a read reminder stays read and tomorrow’s is new', () => {
    const today = buildNotifications(facts()).map((n) => n.id);
    expect(buildNotifications(facts()).map((n) => n.id)).toEqual(today);
    expect(buildNotifications(facts({ today: '2026-10-09' })).map((n) => n.id).some((id) => today.includes(id))).toBe(false);
  });
});
