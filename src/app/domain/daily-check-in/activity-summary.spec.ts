import { ActivityDays, ActivityKind, activityGrid, bestStreak, streakSummary } from './activity-summary';

const TODAY = '2026-10-22'; // a Thursday
const days = (entries: Record<string, ActivityKind[]>): ActivityDays => new Map(Object.entries(entries).map(([d, k]) => [d, new Set(k)]));

describe('activity summary (the streak page)', () => {
  it('finds the longest run of consecutive days, across months', () => {
    expect(bestStreak(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06'])).toBe(4);
    expect(bestStreak([])).toBe(0);
  });

  it('sums up the current and best streaks, totals, this month and the next milestone', () => {
    const summary = streakSummary(
      days({
        '2026-09-10': ['food'],
        '2026-09-11': ['food'],
        '2026-09-12': ['food'],
        '2026-09-13': ['weight'],
        '2026-09-14': ['food'],
        '2026-10-20': ['workout'],
        '2026-10-21': ['food', 'steps'],
        '2026-10-22': ['weight'],
      }),
      TODAY,
    );
    expect(summary).toEqual({ current: 3, best: 5, activeDays: 8, thisMonth: 3, todayActive: true, nextMilestone: 7, reached: [3] });
  });

  it('a streak that has not reached today yet still counts until midnight', () => {
    const summary = streakSummary(days({ '2026-10-20': ['food'], '2026-10-21': ['food'] }), TODAY);
    expect(summary.current).toBe(2);
    expect(summary.todayActive).toBe(false);
  });

  it('lays out whole Monday–Sunday weeks ending with this one, shaded by how much was recorded', () => {
    const grid = activityGrid(days({ '2026-10-22': ['workout', 'food', 'steps'], '2026-10-19': ['food'] }), TODAY, 4);
    expect(grid.weeks).toHaveLength(4);
    const last = grid.weeks[3];
    expect(last.key).toBe('2026-10-19');
    expect(last.days.map((d) => d.level)).toEqual([1, 0, 0, 3, 0, 0, 0]);
    expect(last.days[3].today).toBe(true);
    expect(last.days.slice(4).every((d) => d.future)).toBe(true);
  });

  it('labels a month above the week holding its 1st', () => {
    const grid = activityGrid(new Map(), TODAY, 17); // from Mon 29 Jun: 1 Jul is in the first week
    expect(grid.months.map((m) => m.label)).toEqual(['Jul', 'Aug', 'Sep', 'Oct']);
    expect(grid.months[0].week).toBe(0);
  });
});
