import { waterGlassMl, waterGoalMl } from '../../domain/nutrition';
import { formatWater, glassLabel, toHydration, toWaterWeek, waterNumber } from './nutrition-water';

describe('nutrition water', () => {
  it('fills four glasses, each a quarter of the goal', () => {
    const view = toHydration(1_125, 3_000);
    expect(view.amount).toBe('1.13');
    expect(view.goal).toBe('/ 3.0 L');
    expect(view.glasses).toEqual([1, 0.5, 0, 0]);
    expect(toHydration(250, 3_000).amount).toBe('0.25');
    expect(toHydration(3_000, 3_000).reached).toBe(true);
    expect(toHydration(500, 3_000, 'metric', 'on Tue, 20 Oct').accessibleLabel).toBe('Water on Tue, 20 Oct: 0.5 of 3.0 litres.');
  });

  it('sets the water goal from body weight, in half litres within 2–4 L', () => {
    expect(waterGoalMl(94.5)).toBe(3_000);
    expect(waterGoalMl(50)).toBe(2_000);
    expect(waterGoalMl(150)).toBe(4_000);
    expect(waterGoalMl(null)).toBe(3_000);
  });

  describe('imperial units (US fluid ounces)', () => {
    it('shows whole fluid ounces, and a glass is 8 fl oz', () => {
      expect(waterGlassMl('imperial')).toBe(237);
      expect(waterGlassMl('metric')).toBe(250);
      expect(waterNumber(237, 'imperial')).toBe('8');
      expect(formatWater(3_000, 'imperial')).toBe('101 fl oz');
      expect(formatWater(3_000)).toBe('3.0 L');
      const view = toHydration(948, 3_081, 'imperial');
      expect(view.amount).toBe('32');
      expect(view.goal).toBe('/ 104 fl oz');
      expect(view.accessibleLabel).toBe('Water today: 32 of 104 fluid ounces.');
    });

    it('rounds a suggested goal to whole 8 fl oz glasses, within the same 2–4 L range', () => {
      expect(waterGoalMl(94.5, 'imperial')).toBe(13 * 237);
      expect(waterGoalMl(50, 'imperial') % 237).toBe(0);
      expect(waterGoalMl(150, 'imperial')).toBeLessThanOrEqual(4_100);
      expect(waterGoalMl(null, 'imperial')).toBe(13 * 237);
    });

    it('names the sheet buttons in the unit people pour in', () => {
      expect(glassLabel(1)).toBe('250 ml');
      expect(glassLabel(2)).toBe('500 ml');
      expect(glassLabel(1, 'imperial')).toBe('8 fl oz');
      expect(glassLabel(2, 'imperial')).toBe('16 fl oz');
    });

    it('draws the week in fluid ounces with round axis numbers', () => {
      const week = toWaterWeek('2026-10-19', { '2026-10-19': 3_555, '2026-10-21': 1_777 }, 3_081, '2026-10-22', 'imperial');
      expect(week.chart.ticks.map((t) => t.label)).toEqual(['128', '96', '64', '32', '0']);
      expect(week.chart.targetText).toBe('Daily goal 104 fl oz');
      expect(week.chart.bars[0].spoken).toBe('Monday 19 Oct: 120 fl oz');
      expect(week.average).toBe('90 fl oz');
      expect(week.caption).toBe('Average on 2 days · goal 104 fl oz');
    });
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
