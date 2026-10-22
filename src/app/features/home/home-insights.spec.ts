import { WeightEntry } from '../../domain/body-measurements';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { InsightInputs, toHomeInsights } from './home-insights';

const weigh = (date: string, kilograms: number): WeightEntry => ({
  id: date,
  date,
  weight: { kilograms },
  createdAt: `${date}T08:00:00.000Z`,
  updatedAt: `${date}T08:00:00.000Z`,
});
const profile = (targetKg: number | null) => ({ goalTarget: { targetWeight: targetKg === null ? null : { kilograms: targetKg } } }) as unknown as UserFitnessProfile;

const inputs = (overrides: Partial<InsightInputs> = {}): InsightInputs => ({
  today: { year: 2026, month: 10, day: 22 },
  todayIso: '2026-10-22',
  workouts: [],
  weights: { status: 'ready', entries: [], unitSystem: 'metric' },
  composition: { status: 'ready', assessments: [] },
  profile: profile(null),
  screen: null,
  sessions: [],
  streak: null,
  localDate: (instant) => {
    const [y, m, d] = instant.slice(0, 10).split('-').map(Number);
    return { year: y, month: m, day: d };
  },
  ...overrides,
});

describe('home insights (dashboard cards)', () => {
  it('shows the way to the goal weight from the first weigh-in', () => {
    const [card] = toHomeInsights(
      inputs({ profile: profile(75), weights: { status: 'ready', entries: [weigh('2026-09-01', 85), weigh('2026-10-20', 80)], unitSystem: 'metric' } }),
    );
    expect(card.kind).toBe('goal-weight');
    if (card.kind === 'goal-weight') {
      expect(card.progress).toBeCloseTo(0.5);
      expect(card.reached).toBe(false);
      expect(card.remaining).toContain('to go');
    }
  });

  it('marks the goal reached once the latest weigh-in passes it', () => {
    const [card] = toHomeInsights(
      inputs({ profile: profile(75), weights: { status: 'ready', entries: [weigh('2026-09-01', 85), weigh('2026-10-20', 74.5)], unitSystem: 'metric' } }),
    );
    expect(card).toEqual(expect.objectContaining({ kind: 'goal-weight', reached: true, progress: 1, remaining: 'Goal reached' }));
  });

  it('falls back to the next streak milestone without a goal weight', () => {
    const cards = toHomeInsights(inputs({ streak: 4, weights: { status: 'ready', entries: [weigh('2026-10-20', 80)], unitSystem: 'metric' } }));
    expect(cards.map((c) => c.kind)).toEqual(['streak-milestone']);
    expect(cards[0]).toEqual(expect.objectContaining({ current: 4, next: 7 }));
  });

  it('nudges a weigh-in only when the last one is a week old (or there is none)', () => {
    const kinds = (entries: WeightEntry[]) => toHomeInsights(inputs({ weights: { status: 'ready', entries, unitSystem: 'metric' } })).map((c) => c.kind);
    expect(kinds([weigh('2026-10-16', 80)])).toEqual([]);
    expect(kinds([weigh('2026-10-15', 80)])).toEqual(['weigh-in']);
    expect(kinds([])).toEqual(['weigh-in']);
  });

  it('says nothing when there is nothing true to say', () => {
    expect(toHomeInsights(inputs({ profile: null, weights: { status: 'loading' }, composition: { status: 'loading' }, workouts: null }))).toEqual([]);
  });
});
