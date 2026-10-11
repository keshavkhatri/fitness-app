import { BodyCompositionAssessment, BodyCompositionValues, MANUAL_INBODY_SOURCE } from './body-composition-assessment';
import { bodyCompositionHistory, latestReportedValues, metricChange } from './body-composition-history';

const assessment = (
  id: string,
  date: string,
  reported: BodyCompositionValues,
  createdAt = `${date}T07:00:00.000Z`,
): BodyCompositionAssessment => ({ id, date, source: MANUAL_INBODY_SOURCE, reported, createdAt, updatedAt: createdAt });

describe('body composition history (domain)', () => {
  it('orders newest first by date, then creation time, then id, without changing the input', () => {
    const fat = { 'body-fat-percentage': { value: 22, unit: '%' } } as const;
    const assessments = [
      assessment('b', '2026-10-08', fat, '2026-10-08T06:00:00.000Z'),
      assessment('old', '2026-10-01', fat),
      assessment('c', '2026-10-08', fat, '2026-10-08T18:00:00.000Z'),
      assessment('a', '2026-10-08', fat, '2026-10-08T06:00:00.000Z'),
    ];
    expect(bodyCompositionHistory(assessments).map((a) => a.id)).toEqual(['c', 'b', 'a', 'old']);
    expect(assessments.map((a) => a.id)).toEqual(['b', 'old', 'c', 'a']);
  });

  it('gives each metric its latest reported value, from whichever assessment reported it last', () => {
    const older = assessment('older', '2026-09-01', { weight: { value: 82, unit: 'kg' }, 'lean-body-mass': { value: 60, unit: 'kg' } });
    const newer = assessment('newer', '2026-10-01', { weight: { value: 180, unit: 'lb' }, 'body-fat-percentage': { value: 21.5, unit: '%' } });
    const latest = latestReportedValues([newer, older]);
    expect(latest.slice(0, 4)).toEqual([
      { metric: 'weight', value: { value: 180, unit: 'lb' }, assessment: newer },
      { metric: 'body-fat-mass', value: null, assessment: null },
      { metric: 'lean-body-mass', value: { value: 60, unit: 'kg' }, assessment: older },
      { metric: 'body-fat-percentage', value: { value: 21.5, unit: '%' }, assessment: newer },
    ]);
    expect(latest.slice(4).every((m) => m.value === null)).toBe(true);
  });

  it('nothing recorded: every metric is empty', () => {
    expect(latestReportedValues([]).every((m) => m.value === null && m.assessment === null)).toBe(true);
  });

  describe('metric change', () => {
    it('is latest − previous in the shared unit, skipping assessments without the metric', () => {
      const first = assessment('1', '2026-08-01', { 'body-fat-percentage': { value: 24.9, unit: '%' } });
      const second = assessment('2', '2026-09-01', { 'body-fat-percentage': { value: 22.4, unit: '%' } });
      const third = assessment('3', '2026-10-01', { weight: { value: 80, unit: 'kg' } });
      expect(metricChange([third, first, second], 'body-fat-percentage')).toEqual({
        kind: 'change',
        metric: 'body-fat-percentage',
        latest: second,
        previous: first,
        change: -2.5,
        unit: '%',
      });
    });

    it('keeps the precision of the more precise reading (no float noise)', () => {
      const a = assessment('a', '2026-09-01', { 'body-fat-mass': { value: 18.25, unit: 'kg' } });
      const b = assessment('b', '2026-10-01', { 'body-fat-mass': { value: 18.6, unit: 'kg' } });
      expect(metricChange([a, b], 'body-fat-mass')).toMatchObject({ change: 0.35, unit: 'kg' });
    });

    it('reports no change as 0, never -0', () => {
      const a = assessment('a', '2026-09-01', { weight: { value: 80.1, unit: 'kg' } });
      const b = assessment('b', '2026-10-01', { weight: { value: 80.1, unit: 'kg' } });
      expect(Object.is((metricChange([a, b], 'weight') as { change: number }).change, 0)).toBe(true);
    });

    it('gives no difference between readings in different units', () => {
      const a = assessment('a', '2026-09-01', { weight: { value: 82, unit: 'kg' } });
      const b = assessment('b', '2026-10-01', { weight: { value: 180, unit: 'lb' } });
      expect(metricChange([a, b], 'weight')).toEqual({ kind: 'different-units', metric: 'weight', latest: b, previous: a });
    });

    it('is null with fewer than two readings', () => {
      const a = assessment('a', '2026-09-01', { weight: { value: 82, unit: 'kg' } });
      expect(metricChange([a], 'weight')).toBeNull();
      expect(metricChange([a], 'lean-body-mass')).toBeNull();
      expect(metricChange([], 'weight')).toBeNull();
    });
  });
});
