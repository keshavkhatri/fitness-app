import { waterGoalMl } from '../../domain/nutrition';
import { toHydration, toWaterWeek } from './nutrition-water';

describe('nutrition water', () => {
  it('fills four glasses, each a quarter of the goal', () => {
    const view = toHydration(1_125, 3_000);
    expect(view.amount).toBe('1.13');
    expect(view.goal).toBe('/ 3.0 L');
    expect(view.glasses).toEqual([1, 0.5, 0, 0]);
    expect(toHydration(250, 3_000).amount).toBe('0.25');
    expect(toHydration(3_000, 3_000).reached).toBe(true);
    expect(toHydration(500, 3_000, 'on Tue, 20 Oct').accessibleLabel).toBe('Water on Tue, 20 Oct: 0.5 of 3.0 litres.');
  });

  it('sets the water goal from body weight, in half litres within 2–4 L', () => {
    expect(waterGoalMl(94.5)).toBe(3_000);
    expect(waterGoalMl(50)).toBe(2_000);
    expect(waterGoalMl(150)).toBe(4_000);
    expect(waterGoalMl(null)).toBe(3_000);
  });

  it('shows the week by day: no bar without water, upcoming days marked, the average over logged days', () => {
    // Monday 19 – Sunday 25 October 2026; today Thursday 22.
    const week = toWaterWeek('2026-10-19', { '2026-10-19': 3_000, '2026-10-21': 1_500, '2026-10-12': 4_000 }, 3_000, '2026-10-22');
    expect(week.chart.bars.map((b) => b.status)).toEqual(['logged', 'not-logged', 'logged', 'not-logged', 'upcoming', 'upcoming', 'upcoming']);
    expect(week.chart.bars[0].height).toBe(75); // 3 L of a 4 L axis
    expect(week.chart.targetHeight).toBe(75);
    expect(week.chart.bars[2].spoken).toBe('Wednesday 21 Oct: 1.5 L');
    expect(week.average).toBe('2.25 L');
    expect(week.caption).toBe('Average on 2 days · goal 3.0 L');
    expect(week.goalDays).toBe(1);
  });

  it('a week without water has no average', () => {
    const week = toWaterWeek('2026-10-19', {}, 3_000, '2026-10-22');
    expect(week.average).toBeNull();
    expect(week.caption).toBe('Nothing logged this week · goal 3.0 L');
  });
});
