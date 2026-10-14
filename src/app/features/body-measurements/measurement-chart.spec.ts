import { MeasurementEntry, MeasurementValues } from '../../domain/body-measurements';
import { MEASUREMENT_CHART, measurementChart, sitesInRange } from './measurement-chart';

// Synthetic readings only. Thursday 8 October 2026 is "today".
const TODAY = '2026-10-08';
const entry = (id: string, date: string, values: MeasurementValues): MeasurementEntry => ({
  id,
  date,
  values,
  createdAt: `${date}T06:00:00.000Z`,
  updatedAt: `${date}T06:00:00.000Z`,
});
const ENTRIES = [
  entry('a', '2026-07-15', { waist: { centimeters: 86 } }),
  entry('b', '2026-09-01', { waist: { centimeters: 84 }, chest: { centimeters: 101 } }),
  entry('c', '2026-10-05', { waist: { centimeters: 82.25 } }),
];

describe('measurement chart', () => {
  it('lists the sites read in the range, in display order', () => {
    expect(sitesInRange(ENTRIES, '90d', TODAY)).toEqual(['waist', 'chest']);
    expect(sitesInRange(ENTRIES, '30d', TODAY)).toEqual(['waist']);
    expect(sitesInRange([], 'all', TODAY)).toEqual([]);
  });

  it('a line per site with two or more readings, a lone point otherwise; values in the unit shown', () => {
    const c = measurementChart(ENTRIES, ['waist', 'chest'], '90d', TODAY, 'metric')!;
    expect(c.unit).toBe('cm');
    const [waist, chest] = c.series;
    expect([waist.site, waist.points.length, waist.path !== '']).toEqual(['waist', 3, true]);
    expect([chest.site, chest.points.length, chest.path]).toEqual(['chest', 1, '']);
    expect(waist.spoken).toBe('Waist: 86.0 cm on 15 Jul, 84.0 cm on 1 Sep, 82.3 cm on 5 Oct');
    // Inside the plot area.
    for (const p of c.series.flatMap((s) => s.points)) {
      expect(p.x).toBeGreaterThanOrEqual(MEASUREMENT_CHART.left);
      expect(p.x).toBeLessThanOrEqual(MEASUREMENT_CHART.width - MEASUREMENT_CHART.right);
    }
    const imperial = measurementChart(ENTRIES, ['waist'], '90d', TODAY, 'imperial')!;
    expect(imperial.unit).toBe('in');
    expect(imperial.series[0].spoken).toContain('33.9 in on 15 Jul');
  });

  it('only chosen sites, and null when none has a reading in the range', () => {
    expect(measurementChart(ENTRIES, ['chest'], '90d', TODAY, 'metric')?.series.map((s) => s.site)).toEqual(['chest']);
    expect(measurementChart(ENTRIES, ['hips'], 'all', TODAY, 'metric')).toBeNull();
    expect(measurementChart(ENTRIES, ['chest'], '30d', TODAY, 'metric')).toBeNull();
  });
});
