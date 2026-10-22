/**
 * Geometry for a labelled point chart: readings evenly spaced (one slot each, oldest left), every point with its
 * value above it and its date below, joined by a line. Like a device's own history chart: what you read is what was
 * recorded, nothing is smoothed or interpolated. Pure; the component only draws this.
 */

export interface PointChartPoint {
  readonly key: string;
  readonly value: number;
  /** The value as shown above the point ("97.4"); the unit is in the caption. */
  readonly valueText: string;
  /** First line under the point: "2 Jun". */
  readonly date: string;
  /** Second line, quieter: the weekday, the year or a time. */
  readonly detail?: string | null;
}

export interface LaidOutPoint extends PointChartPoint {
  readonly x: number;
  readonly y: number;
}

export interface PointChartLayout {
  readonly width: number;
  readonly height: number;
  /** Wider than the narrowest card: the chart scrolls sideways. */
  readonly scrolls: boolean;
  readonly points: readonly LaidOutPoint[];
  /** SVG polyline `points`; empty for one point. */
  readonly path: string;
  readonly baseline: number;
  readonly guideTop: number;
  readonly valueOffset: number;
  readonly dateY: number;
  readonly detailY: number;
}

export const POINT_CHART = {
  /** The width drawn at when the card's width isn't known (user units = CSS px). */
  minWidth: 320,
  /** The least room per reading, so values and dates never touch: about seven fit on a phone before it scrolls. */
  slot: 44,
  side: 22,
  height: 212,
  /** The highest a point sits (its value goes above it). */
  plotTop: 42,
  plotBottom: 146,
  dateY: 172,
  detailY: 189,
} as const;

const round = (n: number) => Math.round(n * 10) / 10;

/** `available`: the card's width in CSS px (the chart fills it, and scrolls only when the readings don't fit). */
export function pointChartLayout(points: readonly PointChartPoint[], minSpan = 0, available: number = POINT_CHART.minWidth): PointChartLayout {
  const { slot, side, height, plotTop, plotBottom, dateY, detailY } = POINT_CHART;
  const minWidth = Math.max(240, Math.floor(available));
  const n = points.length;
  const natural = side * 2 + Math.max(0, n - 1) * slot;
  const scrolls = natural > minWidth;
  const width = scrolls ? natural : minWidth;
  const step = n > 1 ? (width - side * 2) / (n - 1) : 0;
  const xOf = (i: number) => (n === 1 ? width / 2 : side + i * step);

  const values = points.map((p) => p.value);
  let lo = values.length ? Math.min(...values) : 0;
  let hi = values.length ? Math.max(...values) : 1;
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const span = hi - lo || 1;
  const yOf = (v: number) => (hi === lo ? (plotTop + plotBottom) / 2 : plotBottom - ((v - lo) / span) * (plotBottom - plotTop));

  const laidOut = points.map((p, i) => ({ ...p, x: round(xOf(i)), y: round(yOf(p.value)) }));
  return {
    width,
    height,
    scrolls,
    points: laidOut,
    path: laidOut.length > 1 ? laidOut.map((p) => `${p.x},${p.y}`).join(' ') : '',
    baseline: plotBottom + 10,
    guideTop: plotTop - 6,
    valueOffset: 12,
    dateY,
    detailY,
  };
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * The two date lines under a point: "2 Jun" and the weekday ("Tue"), or the year when the readings span more than
 * one year (or aren't all this year), so a date is never ambiguous.
 */
export function pointDateLines(isoDates: readonly string[], today: string): (iso: string) => { readonly date: string; readonly detail: string } {
  const year = (iso: string) => iso.slice(0, 4);
  const showYear = isoDates.some((d) => year(d) !== year(today));
  return (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) {
      return { date: iso, detail: '' };
    }
    const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return { date: `${d} ${SHORT_MONTHS[m - 1]}`, detail: showYear ? `${y}` : weekday };
  };
}
