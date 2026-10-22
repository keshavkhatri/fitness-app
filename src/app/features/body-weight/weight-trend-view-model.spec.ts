import { WeightEntry, weightRangeSummary } from '../../domain/body-measurements';
import { axisDateLabel, toTrendSummary, toWeightPointChart } from './weight-trend-view-model';

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

  describe('chart', () => {
    it('labels every weigh-in with its value and its date, oldest first, in the display unit', () => {
      const chart = toWeightPointChart(summaryOf([entry('a', '2026-09-20', 82), entry('b', '2026-10-06', 81.25), entry('c', TODAY, 80.7)]), 'metric', TODAY);
      expect(chart.caption).toBe('Weight (kg)');
      expect(chart.points.map((p) => [p.valueText, p.date, p.detail])).toEqual([
        ['82.0', '20 Sep', 'Sun'],
        ['81.3', '6 Oct', 'Tue'],
        ['80.7', '9 Oct', 'Fri'],
      ]);
      expect(chart.minSpan).toBe(4);
    });

    it('shows pounds for an imperial profile, and the year once the weigh-ins span years', () => {
      const chart = toWeightPointChart(summaryOf([entry('a', '2025-12-30', 80), entry('b', TODAY, 79)], 'all', 'imperial'), 'imperial', TODAY);
      expect(chart.caption).toBe('Weight (lb)');
      expect(chart.points.map((p) => p.detail)).toEqual(['2025', '2026']);
    });
  });
});
