import { activeDayStreak } from './activity-streak';
import { formatSteps, parseDailyCheckIns, recoveryFraction, stepsFraction } from './daily-check-in';

describe('daily check-ins (domain)', () => {
  it('parses stored data strictly: bad dates and values are dropped', () => {
    const parsed = parseDailyCheckIns({
      steps: { '2026-10-08': 8200, '2026-10-07': -5, 'not-a-date': 100, '2026-10-06': 1.5, '2026-10-05': 100_001 },
      recovery: { '2026-10-08': 'good', '2026-10-07': 'amazing' },
    });
    expect(parsed).toEqual({ steps: { '2026-10-08': 8200 }, recovery: { '2026-10-08': 'good' }, activity: {} });
    expect(parseDailyCheckIns(null)).toEqual({ steps: {}, recovery: {}, activity: {} });
    expect(parseDailyCheckIns('x')).toEqual({ steps: {}, recovery: {}, activity: {} });
  });

  it('formats steps compactly, never rounding up', () => {
    expect([0, 820, 999, 1000, 8249, 8299, 9999, 12_500].map(formatSteps)).toEqual(['0', '820', '999', '1k', '8.2k', '8.2k', '9.9k', '12k']);
  });

  it('turns steps and recovery into 0–1 shares', () => {
    expect(stepsFraction(8200)).toBeCloseTo(0.82);
    expect(stepsFraction(15_000)).toBe(1);
    expect(stepsFraction(10, 0)).toBe(0);
    expect(['poor', 'fair', 'good', 'great'].map((l) => recoveryFraction(l as never))).toEqual([0.25, 0.5, 0.75, 1]);
  });

  describe('active-day streak', () => {
    const days = (...d: string[]) => new Set(d);

    it('counts consecutive days ending today', () => {
      expect(activeDayStreak(days('2026-10-06', '2026-10-07', '2026-10-08'), '2026-10-08')).toBe(3);
    });

    it('today not active yet: the streak ending yesterday still counts', () => {
      expect(activeDayStreak(days('2026-10-06', '2026-10-07'), '2026-10-08')).toBe(2);
    });

    it('a gap ends it; nothing recent is 0', () => {
      expect(activeDayStreak(days('2026-10-05', '2026-10-07', '2026-10-08'), '2026-10-08')).toBe(2);
      expect(activeDayStreak(days('2026-10-05'), '2026-10-08')).toBe(0);
      expect(activeDayStreak(days(), '2026-10-08')).toBe(0);
    });

    it('crosses month and year boundaries', () => {
      expect(activeDayStreak(days('2025-12-31', '2026-01-01'), '2026-01-01')).toBe(2);
      expect(activeDayStreak(days('2024-02-28', '2024-02-29', '2024-03-01'), '2024-03-01')).toBe(3);
    });
  });
});
