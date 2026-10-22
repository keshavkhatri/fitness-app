import { HomeWorkoutView } from '../home/home-training';
import { NotificationFacts, buildNotifications, filterNotifications, notificationDayLabel } from './notifications';

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
const kinds = (f: Partial<NotificationFacts> = {}) => buildNotifications(facts(f)).map((n) => n.action?.kind);

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

  it('gives each reminder a category, its day and the facts it was built from', () => {
    const items = buildNotifications(facts({ daysSinceWeighIn: 9 }));
    expect(items.map((n) => n.category)).toEqual(['workout', 'recovery', 'nutrition', 'progress']);
    expect(items.every((n) => n.date === '2026-10-08')).toBe(true);
    expect(items[0].details.map((d) => [d.label, d.value])).toEqual([
      ['Workout', 'Upper Body A'],
      ['Exercises', '7 exercises'],
      ['Estimated time', 'About 45 min'],
    ]);
    expect(items[3].details).toEqual([{ icon: 'calendar-outline', label: 'Last weigh-in', value: '9 days ago' }]);
  });

  it('filters by unread and by category without touching read state', () => {
    const items = buildNotifications(facts());
    const read = new Set([items[0].id]);
    const isRead = vi.fn((id: string) => read.has(id));
    expect(filterNotifications(items, 'all', isRead)).toEqual(items);
    expect(filterNotifications(items, 'unread', isRead).map((n) => n.category)).toEqual(['recovery', 'nutrition', 'progress']);
    expect(filterNotifications(items, 'workout', isRead).map((n) => n.id)).toEqual([items[0].id]);
    expect(filterNotifications(items, 'nutrition', isRead).map((n) => n.action?.kind)).toEqual(['log-food']);
    expect(filterNotifications([], 'unread', isRead)).toEqual([]);
    expect(read.size).toBe(1);
  });

  it('labels the day without inventing a time', () => {
    expect(notificationDayLabel('2026-10-08', '2026-10-08')).toBe('Today · Thursday, October 8');
    expect(notificationDayLabel('2026-10-07', '2026-10-08')).toBe('Wednesday, October 7');
  });
});
