import {
  DEFAULT_REMINDER_SETTINGS,
  ReminderFacts,
  ReminderSettings,
  atLocal,
  inQuietHours,
  parseReminderSettings,
  planReminders,
  reminderId,
} from './reminder-plan';

const ON: ReminderSettings = { ...DEFAULT_REMINDER_SETTINGS, enabled: true, dailyCap: 6 };
// Thursday 22 October 2026, 06:00 local.
const NOW = new Date(2026, 9, 22, 6, 0);
const DAYS = ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28'];

const facts = (overrides: Partial<ReminderFacts> = {}): ReminderFacts => ({
  days: DAYS.map((date, i) => ({ date, session: i % 2 === 0 ? { id: `s${i}`, title: 'Upper A', kind: 'resistance' as const } : null })),
  trainedToday: false,
  foodLoggedToday: false,
  recoveryToday: false,
  activeToday: false,
  streak: 0,
  daysSinceWeighIn: 2,
  openWorkout: null,
  ...overrides,
});

describe('reminder plan', () => {
  it('plans nothing while reminders are off', () => {
    expect(planReminders(DEFAULT_REMINDER_SETTINGS, facts(), NOW)).toEqual([]);
  });

  it('reminds on planned training days at the chosen time, and not today once trained', () => {
    const planned = planReminders(ON, facts(), NOW).filter((r) => r.kind === 'training');
    expect(planned.map((r) => r.at)).toEqual([0, 2, 4, 6].map((i) => atLocal(DAYS[i], '08:00')));
    expect(planned[0].action).toEqual({ kind: 'open-session', sessionId: 's0' });

    const trained = planReminders(ON, facts({ trainedToday: true }), NOW).filter((r) => r.kind === 'training');
    expect(trained.map((r) => r.at)).toEqual([2, 4, 6].map((i) => atLocal(DAYS[i], '08:00')));
  });

  it('never plans a reminder in the past or inside quiet hours', () => {
    const late = planReminders(ON, facts(), new Date(2026, 9, 22, 9, 0)).filter((r) => r.kind === 'training');
    expect(late[0].at).toEqual(atLocal(DAYS[2], '08:00'));

    const quiet = planReminders({ ...ON, training: { on: true, time: '06:30' } }, facts(), NOW);
    expect(quiet.some((r) => r.kind === 'training')).toBe(false);
  });

  it('warns about a streak only when it is worth keeping and nothing is logged today', () => {
    expect(planReminders(ON, facts({ streak: 2 }), NOW).some((r) => r.kind === 'streak')).toBe(false);
    expect(planReminders(ON, facts({ streak: 5, activeToday: true }), NOW).some((r) => r.kind === 'streak')).toBe(false);
    const streak = planReminders(ON, facts({ streak: 5 }), NOW).find((r) => r.kind === 'streak');
    expect(streak?.title).toBe('Keep your 5-day streak');
    expect(streak?.at).toEqual(atLocal(DAYS[0], '20:00'));
  });

  it('asks for a weigh-in on the chosen weekday only when the last one is a week old', () => {
    // Monday 26 October is 4 days ahead.
    expect(planReminders(ON, facts({ daysSinceWeighIn: 1 }), NOW).some((r) => r.kind === 'weigh-in')).toBe(false);
    const due = planReminders(ON, facts({ daysSinceWeighIn: 3 }), NOW).find((r) => r.kind === 'weigh-in');
    expect(due?.at).toEqual(atLocal('2026-10-26', '08:00'));
    expect(planReminders(ON, facts({ daysSinceWeighIn: null }), NOW).some((r) => r.kind === 'weigh-in')).toBe(true);
  });

  it('nudges an open workout two hours after its last set', () => {
    const open = planReminders(ON, facts({ openWorkout: { sessionId: 's0', title: 'Upper A', lastActivityAt: new Date(2026, 9, 22, 7, 15) } }), NOW).find(
      (r) => r.kind === 'open-workout',
    );
    expect(open?.at).toEqual(new Date(2026, 9, 22, 9, 15));
    expect(open?.action).toEqual({ kind: 'resume', sessionId: 's0' });
  });

  it('keeps the most useful reminders of each day under the daily cap', () => {
    const settings: ReminderSettings = { ...ON, dailyCap: 2, meals: { on: true, times: ['13:00', '19:00'] }, recovery: { on: true, time: '08:30' } };
    const today = planReminders(settings, facts({ streak: 4 }), NOW).filter((r) => r.at.toDateString() === NOW.toDateString());
    expect(today.map((r) => r.kind)).toEqual(['training', 'streak']);
  });

  it('gives each reminder a stable positive id', () => {
    const [a] = planReminders(ON, facts(), NOW);
    const [b] = planReminders(ON, facts(), NOW);
    expect(a.id).toBe(b.id);
    expect(a.id).toBeGreaterThan(0);
    expect(reminderId('training:2026-10-22')).not.toBe(reminderId('training:2026-10-23'));
  });

  it('handles quiet hours that wrap past midnight', () => {
    const quiet = { start: '22:00', end: '07:00' };
    expect(inQuietHours(new Date(2026, 9, 22, 23, 0), quiet)).toBe(true);
    expect(inQuietHours(new Date(2026, 9, 22, 6, 59), quiet)).toBe(true);
    expect(inQuietHours(new Date(2026, 9, 22, 7, 0), quiet)).toBe(false);
    expect(inQuietHours(new Date(2026, 9, 22, 13, 0), { start: '12:00', end: '14:00' })).toBe(true);
  });

  it('reads stored settings strictly, field by field', () => {
    expect(parseReminderSettings(null)).toEqual(DEFAULT_REMINDER_SETTINGS);
    const parsed = parseReminderSettings({ enabled: true, training: { on: false, time: '25:00' }, weighIn: { weekday: 9 }, dailyCap: 3 });
    expect(parsed.enabled).toBe(true);
    expect(parsed.training).toEqual({ on: false, time: DEFAULT_REMINDER_SETTINGS.training.time });
    expect(parsed.weighIn.weekday).toBe(DEFAULT_REMINDER_SETTINGS.weighIn.weekday);
    expect(parsed.dailyCap).toBe(3);
  });
});
