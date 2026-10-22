import { POINT_CHART, PointChartPoint, pointChartLayout, pointDateLines } from './point-chart-layout';

const point = (i: number, value: number): PointChartPoint => ({ key: `p${i}`, value, valueText: `${value}`, date: `${i + 1} Jun` });

describe('point chart layout', () => {
  it('spaces readings evenly across the card, oldest left, and joins them in order', () => {
    const layout = pointChartLayout([point(0, 97.4), point(1, 98), point(2, 94.5)]);
    expect(layout.scrolls).toBe(false);
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

  it('fits seven readings on a phone-width card without scrolling', () => {
    const week = Array.from({ length: 7 }, (_, i) => point(i, 90 + i));
    expect(pointChartLayout(week, 0, 311).scrolls).toBe(false);
  });

  it('gives each reading its own slot and scrolls once they no longer fit', () => {
    const many = Array.from({ length: 12 }, (_, i) => point(i, 80 + i));
    const layout = pointChartLayout(many);
    expect(layout.scrolls).toBe(true);
    expect(layout.points[1].x - layout.points[0].x).toBe(POINT_CHART.slot);
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
