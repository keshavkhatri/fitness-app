import { BodyCompositionAssessment, ReportedValue } from '../../../domain/body-composition';
import { toCompositionTrend } from './composition-trend-view-model';

const TODAY = '2026-10-22';
let n = 0;
const assessment = (date: string, reported: Record<string, ReportedValue>): BodyCompositionAssessment => ({
  id: `a${n++}`,
  date,
  source: { device: 'inbody', entryMethod: 'manual' },
  reported,
  createdAt: `${date}T08:00:00.000Z`,
  updatedAt: `${date}T08:00:00.000Z`,
});
const pbf = (value: number): ReportedValue => ({ value, unit: '%' });
const kg = (value: number): ReportedValue => ({ value, unit: 'kg' });

const SERIES = [
  assessment('2026-06-02', { 'body-fat-percentage': pbf(31.5), 'skeletal-muscle-mass': kg(30.1), 'ecw-ratio': { value: 0.381, unit: 'none' } }),
  assessment('2026-08-15', { 'body-fat-percentage': pbf(27.4), 'skeletal-muscle-mass': kg(31.6) }),
  assessment('2026-10-01', { 'body-fat-percentage': pbf(25.8), 'skeletal-muscle-mass': kg(31.9), 'ecw-ratio': { value: 0.374, unit: 'none' } }),
];

describe('Body composition trend', () => {
  it('has nothing to show without assessments', () => {
    expect(toCompositionTrend([], null, 'all', TODAY)).toEqual({ kind: 'none' });
  });

  it('offers only the values that have readings, body fat first, and draws the chosen one oldest first', () => {
    const view = toCompositionTrend(SERIES, null, 'all', TODAY);
    if (view.kind !== 'ready') {
      throw new Error('expected a trend');
    }
    expect(view.options.map((o) => o.label)).toEqual(['Body fat %', 'Muscle', 'ECW ratio']);
    expect(view.metric).toBe('body-fat-percentage');
    expect(view.caption).toBe('Body fat percentage');
    expect(view.count).toBe(3);
    expect(view.chart!.points.map((p) => [p.valueText, p.date])).toEqual([
      ['31.5', '2 Jun'],
      ['27.4', '15 Aug'],
      ['25.8', '1 Oct'],
    ]);
    expect(view.chart!.unit).toBe('%');
    expect(view.chart!.caption).toBe('Body fat percentage (%)');
    expect(view.description).toBe('Body fat percentage, all time: 3 readings, from 31.5% on Jun 2 to 25.8% on Oct 1.');
  });

  it('switches metric; a unitless ratio keeps its digits and a small span', () => {
    const view = toCompositionTrend(SERIES, 'ecw-ratio', 'all', TODAY);
    if (view.kind !== 'ready') {
      throw new Error('expected a trend');
    }
    expect(view.count).toBe(2);
    expect(view.chart!.unit).toBe('');
    expect(view.chart!.caption).toBe('ECW ratio');
    expect(view.chart!.points.map((p) => p.valueText)).toEqual(['0.381', '0.374']);
    expect(view.chart!.minSpan).toBe(0.01);
  });

  it('keeps to the range, and says so when it holds nothing', () => {
    const recent = toCompositionTrend(SERIES, 'skeletal-muscle-mass', '30d', TODAY);
    expect(recent.kind === 'ready' && recent.count).toBe(1);
    const empty = toCompositionTrend([SERIES[0]], 'body-fat-percentage', '30d', TODAY);
    expect(empty.kind === 'ready' && empty.chart).toBeNull();
  });

  it('never mixes units: readings in another unit than the latest are left out', () => {
    const mixed = [assessment('2026-06-02', { 'skeletal-muscle-mass': { value: 66.4, unit: 'lb' } }), ...SERIES.slice(1)];
    const view = toCompositionTrend(mixed, 'skeletal-muscle-mass', 'all', TODAY);
    expect(view.kind === 'ready' && view.count).toBe(2);
  });

  it('falls back to the first available metric when the chosen one has no readings', () => {
    const view = toCompositionTrend(SERIES, 'phase-angle', 'all', TODAY);
    expect(view.kind === 'ready' && view.metric).toBe('body-fat-percentage');
  });
});
