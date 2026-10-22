import { POINT_CHART, PointChartPoint, pointChartLayout, pointDateLines } from './point-chart-layout';

const point = (i: number, value: number): PointChartPoint => ({ key: `p${i}`, value, valueText: `${value}`, date: `${i + 1} Jun` });

describe('point chart layout', () => {
  it('spaces readings evenly across the card, oldest left, and joins them in order', () => {
    const layout = pointChartLayout([point(0, 97.4), point(1, 98), point(2, 94.5)]);
    expect(layout.thinned).toBe(false);
    expect(layout.width).toBe(POINT_CHART.minWidth);
    const xs = layout.points.map((p) => p.x);
    expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1], 1);
    expect(layout.path.split(' ')).toHaveLength(3);
  });

  it('puts higher values higher, and keeps every value inside the plot', () => {
    const layout = pointChartLayout([point(0, 97.4), point(1, 98.1), point(2, 94.5)]);
    const [a, b, c] = layout.points;
    expect(b.y).toBeLessThan(a.y);
    expect(c.y).toBeGreaterThan(a.y);
    for (const p of layout.points) {
      expect(p.y).toBeGreaterThanOrEqual(POINT_CHART.plotTop);
      expect(p.y).toBeLessThanOrEqual(POINT_CHART.plotBottom);
    }
  });

  it('labels all seven readings of a phone-width card', () => {
    const week = Array.from({ length: 7 }, (_, i) => point(i, 90 + i));
    const layout = pointChartLayout(week, 0, 311);
    expect(layout.thinned).toBe(false);
    expect(layout.points.every((p) => p.labelled)).toBe(true);
  });

  it('never scrolls: with more readings it draws them all, and labels the first, latest, highest, lowest and some between', () => {
    const values = [80, 81, 79, 83, 82, 78, 80, 84, 81, 80, 79, 82, 81, 80, 77, 79, 80, 81, 82, 80];
    const layout = pointChartLayout(values.map((v, i) => point(i, v)), 0, 311);
    expect(layout.width).toBe(311);
    expect(layout.thinned).toBe(true);
    expect(layout.points).toHaveLength(20);
    const labelled = layout.points.filter((p) => p.labelled);
    expect(labelled.length).toBeLessThanOrEqual(7);
    const keys = labelled.map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['p0', 'p19', 'p7', 'p14'])); // first, latest, highest (84), lowest (77)
    // Labels never overlap.
    const xs = labelled.map((p) => p.x).sort((a, b) => a - b);
    xs.slice(1).forEach((x, i) => expect(x - xs[i]).toBeGreaterThanOrEqual(POINT_CHART.slot));
  });

  it('draws one reading as a single centred point, with no line', () => {
    const layout = pointChartLayout([point(0, 80)], 0, 320);
    expect(layout.points[0].x).toBe(160);
    expect(layout.path).toBe('');
  });

  it('does not exaggerate a small change: the span is at least minSpan', () => {
    const flat = pointChartLayout([point(0, 80), point(1, 80.2)], 4);
    expect(Math.abs(flat.points[1].y - flat.points[0].y)).toBeLessThan(10);
  });
});

describe('point date lines', () => {
  it('shows the day and month, with the weekday this year', () => {
    const lines = pointDateLines(['2026-06-02', '2026-10-01'], '2026-10-22');
    expect(lines('2026-06-02')).toEqual({ date: '2 Jun', detail: 'Tue' });
  });

  it('shows the year instead once any reading is from another year', () => {
    const lines = pointDateLines(['2025-12-30', '2026-01-04'], '2026-10-22');
    expect(lines('2025-12-30')).toEqual({ date: '30 Dec', detail: '2025' });
    expect(lines('2026-01-04')).toEqual({ date: '4 Jan', detail: '2026' });
  });
});
