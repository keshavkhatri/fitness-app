import { MEASUREMENT_SITES, MeasurementEntry, MeasurementSite, WeightRange, circumferenceInUnit, lengthUnitLabel, rangeStart } from '../../domain/body-measurements';
import { IsoCalendarDate, UnitSystem, parseIsoCalendarDate, roundTo } from '../../domain/fitness-profile';
import { MEASUREMENT_COPY } from './measurement-content';

/**
 * Recorded circumferences over a range, one series per site: actual
 * readings only, joined in date order (no smoothing or estimates). A site
 * read once is a point without a line; a site never read in the range isn't
 * drawn. Pure; the chart component only draws what this returns.
 */

export const MEASUREMENT_CHART = { width: 320, height: 180, left: 36, right: 12, top: 12, bottom: 26 } as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100];
const MIN_SPAN: Readonly<Record<UnitSystem, number>> = { metric: 10, imperial: 4 };

export interface MeasurementSeriesView {
  readonly site: MeasurementSite;
  readonly label: string;
  /** 0–4: colour and marker shape (sites stay apart without colour alone). */
  readonly index: number;
  readonly points: readonly { readonly key: string; readonly x: number; readonly y: number }[];
  /** SVG polyline points; empty with a single reading. */
  readonly path: string;
  /** "Waist: 82.0 cm on 5 Sep, 80.5 cm on 1 Oct" */
  readonly spoken: string;
}

export interface MeasurementChartView {
  readonly unit: string;
  readonly series: readonly MeasurementSeriesView[];
  readonly yTicks: readonly { readonly y: number; readonly label: string }[];
  readonly xLabels: readonly { readonly x: number; readonly label: string; readonly anchor: 'start' | 'middle' | 'end' }[];
}

const dayNumber = (iso: IsoCalendarDate) => {
  const d = parseIsoCalendarDate(iso);
  return d ? Date.UTC(d.year, d.month - 1, d.day) / 86_400_000 : Number.NaN;
};
const shortDate = (iso: IsoCalendarDate) => {
  const d = parseIsoCalendarDate(iso);
  return d ? `${d.day} ${MONTHS[d.month - 1]}` : iso;
};
const monthLabel = (day: number) => MONTHS[new Date(day * 86_400_000).getUTCMonth()];

/** Day numbers of the first of each month from `from` to `to` (inclusive). */
function monthStartsWithin(from: number, to: number): number[] {
  const first = new Date(from * 86_400_000);
  const starts: number[] = [];
  for (let month = first.getUTCMonth() + 1, year = first.getUTCFullYear(); ; month++) {
    const day = Date.UTC(year, month, 1) / 86_400_000; // Date.UTC rolls month 12 into the next year
    if (day > to) {
      return starts;
    }
    if (day >= from) {
      starts.push(day);
    }
  }
}

/** Sites read at least once in the range (in display order). */
export function sitesInRange(entries: readonly MeasurementEntry[], range: WeightRange, today: IsoCalendarDate): MeasurementSite[] {
  const start = rangeStart(range, today);
  const inRange = entries.filter((e) => (start === null || e.date >= start) && e.date <= today);
  return MEASUREMENT_SITES.filter((site) => inRange.some((e) => e.values[site]));
}

/** null when no chosen site has a reading in the range. */
export function measurementChart(
  entries: readonly MeasurementEntry[],
  sites: readonly MeasurementSite[],
  range: WeightRange,
  today: IsoCalendarDate,
  unitSystem: UnitSystem,
): MeasurementChartView | null {
  const start = rangeStart(range, today);
  const inRange = [...entries]
    .filter((e) => (start === null || e.date >= start) && e.date <= today)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1));
  const raw = MEASUREMENT_SITES.filter((site) => sites.includes(site)).flatMap((site) => {
    const readings = inRange.flatMap((e) => {
      const value = e.values[site];
      return value ? [{ key: `${e.id}-${site}`, date: e.date, value: roundTo(circumferenceInUnit(value, unitSystem), 1) }] : [];
    });
    return readings.length ? [{ site, index: MEASUREMENT_SITES.indexOf(site), readings }] : [];
  });
  if (raw.length === 0) {
    return null;
  }

  const all = raw.flatMap((s) => s.readings.map((r) => r.value));
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi - lo < MIN_SPAN[unitSystem]) {
    const mid = (lo + hi) / 2;
    lo = mid - MIN_SPAN[unitSystem] / 2;
    hi = mid + MIN_SPAN[unitSystem] / 2;
  }
  const step = STEPS.find((s) => (hi - lo) / s <= 4) ?? 100;
  const min = Math.floor(lo / step) * step;
  const max = Math.max(min + step, Math.ceil(hi / step) * step);

  const C = MEASUREMENT_CHART;
  const firstDay = dayNumber(start ?? inRange[0].date);
  const lastDay = dayNumber(today);
  const span = Math.max(1, lastDay - firstDay);
  const plotW = C.width - C.left - C.right;
  const plotH = C.height - C.top - C.bottom;
  const x = (iso: IsoCalendarDate) => roundTo(C.left + ((dayNumber(iso) - firstDay) / span) * plotW, 2);
  const y = (v: number) => roundTo(C.top + (1 - (v - min) / (max - min)) * plotH, 2);
  const unit = lengthUnitLabel(unitSystem);

  const yTicks = [];
  for (let v = min; v <= max + 1e-9; v += step) {
    yTicks.push({ y: y(v), label: String(roundTo(v, 1)) });
  }
  // Month names across the axis (up to four), each at the first of its month so no month repeats
  // and none sits on an edge; else the start and end dates.
  const xLabels: { x: number; label: string; anchor: 'start' | 'middle' | 'end' }[] = [];
  const monthStarts = span > 45 ? monthStartsWithin(firstDay + 3, lastDay - 3) : [];
  if (monthStarts.length >= 2) {
    const shown = monthStarts.length <= 4 ? monthStarts : [0, 1, 2, 3].map((i) => monthStarts[Math.round((i * (monthStarts.length - 1)) / 3)]);
    for (const day of shown) {
      xLabels.push({ x: roundTo(C.left + ((day - firstDay) / span) * plotW, 2), label: monthLabel(day), anchor: 'middle' });
    }
  } else {
    xLabels.push({ x: C.left, label: shortDate(start ?? inRange[0].date), anchor: 'start' });
    xLabels.push({ x: C.width - C.right, label: shortDate(today), anchor: 'end' });
  }

  return {
    unit,
    yTicks,
    xLabels,
    series: raw.map(({ site, index, readings }) => {
      const points = readings.map((r) => ({ key: r.key, x: x(r.date), y: y(r.value) }));
      const label = MEASUREMENT_COPY.sites[site];
      return {
        site,
        label,
        index,
        points,
        path: points.length > 1 ? points.map((p) => `${p.x},${p.y}`).join(' ') : '',
        spoken: `${label}: ${readings.map((r) => `${r.value.toFixed(1)} ${unit} on ${shortDate(r.date)}`).join(', ')}`,
      };
    }),
  };
}
