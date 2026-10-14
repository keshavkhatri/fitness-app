import { WeightEntry, weightRangeSummary } from '../../domain/body-measurements';
import { CHART, axisDateLabel, toTrendSummary, toWeightChart, yAxis } from './weight-trend-view-model';

const TODAY = '2026-10-09';
const entry = (id: string, date: string, kilograms: number, createdAt = `${date}T06:00:00.000Z`): WeightEntry => ({
  id,
  date,
  weight: { kilograms },
  createdAt,
  updatedAt: createdAt,
});
const summaryOf = (list: WeightEntry[], range: '30d' | '90d' | 'all' = '30d', unit: 'metric' | 'imperial' = 'metric') =>
  weightRangeSummary(list, range, TODAY, unit)!;
const LABELS = { start: 'Sep 10', end: 'Today' };

describe('weight trend view model', () => {
  describe('summary', () => {
    it('first, latest and the labelled change', () => {
      const view = toTrendSummary(summaryOf([entry('a', '2026-09-20', 82), entry('b', TODAY, 80.7)]), '30d', 'metric', TODAY);
      expect(view.first).toEqual({ key: 'a', weight: '82.0 kg', dateLabel: 'Sunday, Sep 20' });
      expect(view.latest).toEqual({ key: 'b', weight: '80.7 kg', dateLabel: 'Today' });
      expect(view.change).toBe('−1.3 kg');
      expect(view.changeCaption).toBe('Between first and latest recorded measurements');
      expect(view.changeFrom).toBe('From 82.0 kg, Sunday, Sep 20');
      expect([view.lowest?.key, view.highest?.key]).toEqual(['b', 'a']);
      expect(view.description).toBe(
        'Weight chart for the last 30 days: 2 measurements, from 82.0 kg (Sunday, Sep 20) to 80.7 kg (Today). Change between first and latest recorded measurements: −1.3 kg.',
      );
    });

    it('a single measurement claims no change', () => {
      const view = toTrendSummary(summaryOf([entry('a', TODAY, 80)], '90d', 'imperial'), '90d', 'imperial', TODAY);
      expect(view.first).toEqual(view.latest);
      expect(view.first.weight).toBe('176.4 lb');
      expect(view.change).toBeNull();
      expect(view.changeCaption).toContain('Only one measurement');
      expect([view.changeFrom, view.lowest, view.highest]).toEqual([null, null, null]);
      expect(view.description).toBe('Weight chart for the last 90 days: one measurement, 176.4 lb (Today).');
    });

    it('equal first and latest say "No change"; same-day measurements are all listed', () => {
      const view = toTrendSummary(
        summaryOf([entry('am', TODAY, 80, `${TODAY}T05:00:00.000Z`), entry('pm', TODAY, 80.4, `${TODAY}T19:00:00.000Z`), entry('x', '2026-10-01', 80)]),
        '30d',
        'metric',
        TODAY,
      );
      expect(view.change).toBe('+0.4 kg');
      expect(view.measurements.map((m) => m.key)).toEqual(['x', 'am', 'pm']);
      const flat = toTrendSummary(summaryOf([entry('a', '2026-10-01', 80), entry('b', TODAY, 80)]), '30d', 'metric', TODAY);
      expect(flat.change).toBe('No change');
      // Equal extremes: the latest of them.
      expect([flat.lowest?.key, flat.highest?.key]).toEqual(['b', 'b']);
      expect([view.lowest?.key, view.highest?.key]).toEqual(['am', 'pm']);
    });

    it('axis date labels', () => {
      expect(axisDateLabel(TODAY, TODAY)).toBe('Today');
      expect(axisDateLabel('2026-09-10', TODAY)).toBe('Sep 10');
      expect(axisDateLabel('2025-12-31', TODAY)).toBe('Dec 31, 2025');
    });
  });

  describe('chart geometry', () => {
    const plot = { left: CHART.left, right: CHART.width - CHART.right, top: CHART.top, bottom: CHART.height - CHART.bottom };

    it('places points by measurement date across the window and joins them in order', () => {
      const chart = toWeightChart(summaryOf([entry('a', '2026-09-10', 82), entry('b', TODAY, 80)]), '2026-09-10', TODAY, 'metric', LABELS);
      const [a, b] = chart.points;
      expect(a.x).toBeGreaterThan(plot.left);
      expect(a.x).toBeLessThan(plot.left + 10); // first day's slot
      expect(b.x).toBeGreaterThan(plot.right - 10); // today's slot
      expect(b.x).toBeLessThanOrEqual(plot.right);
      expect(a.y).toBeLessThan(b.y); // heavier is higher
      expect(chart.path).toBe(`${a.x},${a.y} ${b.x},${b.y}`);
      expect(chart.xLabels.map((l) => l.label)).toEqual(['Sep 10', 'Today']);
      expect(chart.unit).toBe('kg');
    });

    it('a single measurement is a visible point with no line', () => {
      const chart = toWeightChart(summaryOf([entry('a', TODAY, 80)], 'all'), TODAY, TODAY, 'metric', { start: 'Today', end: 'Today' });
      expect(chart.points).toHaveLength(1);
      expect(chart.path).toBe('');
      const [p] = chart.points;
      expect(p.x).toBeCloseTo((plot.left + plot.right) / 2, 0);
      expect(p.y).toBeGreaterThan(plot.top);
      expect(p.y).toBeLessThan(plot.bottom);
    });

    it('same-day measurements stay separate points within their day', () => {
      const chart = toWeightChart(
        summaryOf([entry('am', TODAY, 80, `${TODAY}T05:00:00.000Z`), entry('pm', TODAY, 80, `${TODAY}T19:00:00.000Z`)], 'all'),
        TODAY,
        TODAY,
        'metric',
        LABELS,
      );
      expect(chart.points.map((p) => p.key)).toEqual(['am', 'pm']);
      expect(chart.points[0].x).toBeLessThan(chart.points[1].x);
      expect(chart.points[0].y).toBe(chart.points[1].y);
    });

    it('small differences are not exaggerated: at least a 4 kg / 10 lb span', () => {
      expect(yAxis([80, 80.2], 'metric')).toEqual({ min: 78, max: 83, step: 1 });
      expect(yAxis([176, 176.4], 'imperial')).toEqual({ min: 170, max: 185, step: 5 });
      expect(yAxis([70, 95], 'metric')).toEqual({ min: 70, max: 100, step: 10 });
      const chart = toWeightChart(summaryOf([entry('a', '2026-10-01', 80), entry('b', TODAY, 80.2)]), '2026-09-10', TODAY, 'metric', LABELS);
      const drop = Math.abs(chart.points[0].y - chart.points[1].y);
      expect(drop).toBeLessThan((plot.bottom - plot.top) * 0.1); // 0.2 kg is a small step, not a cliff
      expect(chart.yTicks.map((t) => t.label)).toEqual(['78', '79', '80', '81', '82', '83']);
    });

    it('an unusable window throws (the page then falls back to text)', () => {
      expect(() => toWeightChart(summaryOf([entry('a', TODAY, 80)]), 'bad', TODAY, 'metric', LABELS)).toThrow();
    });
  });
});
