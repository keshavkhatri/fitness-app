import { CalendarDate, calendarDateOf, compareCalendarDates } from '../../../domain/fitness-profile';
import { Exercise } from '../../../domain/workout-programming';
import { ExercisePerformance, ExercisePerformanceSession, PerformedSet, topSet } from '../../../domain/workout-session';
import { MUSCLE_AREAS, WORKOUT_COPY } from '../workout-content';
import { CATALOG } from '../workout-view-model';
import { formatPerformedSet, performedOnLabel } from './progress-view-model';

/**
 * Performed exercises as rows: identity, body area (from the catalog), the
 * latest top set, and a small trend of the top set across recent comparable
 * sessions. Everything is a logged value; nothing is estimated.
 */

const copy = WORKOUT_COPY.progress.exercises;
const localDateOf = (instant: string) => calendarDateOf(new Date(instant));

/** How many recent sessions the row's trend shows. */
export const TREND_SESSIONS = 6;

export interface ExerciseTrendView {
  /** Bar heights 0..1 (relative to the largest), oldest first. */
  readonly bars: readonly number[];
  /** "+5 kg", "+2 reps", "No change"; between the first and last bar. */
  readonly change: string;
  readonly direction: 'up' | 'down' | 'same';
  /** "since Sep 21" */
  readonly since: string;
}

export interface ExerciseRowView {
  readonly exerciseId: string;
  readonly name: string;
  /** First body area ("Chest"); null when the exercise isn't in the catalog. */
  readonly area: string | null;
  /** All body areas, for filtering. */
  readonly areas: readonly string[];
  /** Top set of the latest session: "62.5 kg × 7". */
  readonly latest: string;
  /** "Oct 8", "Today" */
  readonly lastLabel: string;
  readonly lastDate: CalendarDate;
  /** Null with fewer than two comparable sessions (no trend from one point). */
  readonly trend: ExerciseTrendView | null;
  readonly accessibleLabel: string;
}

/** The value a session's trend is about: its top set's weight, reps or time (by logging mode). */
export function trendValue(session: ExercisePerformanceSession): number | null {
  const set: PerformedSet = topSet(session);
  switch (session.logging) {
    case 'duration':
      return set.durationSeconds;
    case 'reps':
      return set.reps;
    default:
      return set.weight;
  }
}

const unitOf = (session: ExercisePerformanceSession) =>
  session.logging === 'duration' ? 'sec' : session.logging === 'reps' ? 'reps' : session.weightUnit;

const decimals = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** "+5 kg" / "−2 reps" / "No change" (a true minus sign). */
export function formatTrendChange(change: number, unit: string): string {
  if (change === 0) {
    return copy.noChange;
  }
  return `${change > 0 ? '+' : '−'}${decimals.format(Math.abs(change))} ${unit}`;
}

/** The latest sessions comparable with the newest one (same logging mode and unit), oldest first. */
export function comparableSessions(performance: ExercisePerformance, limit: number): ExercisePerformanceSession[] {
  const latest = performance.sessions[0];
  return performance.sessions
    .filter((s) => s.logging === latest.logging && s.weightUnit === latest.weightUnit)
    .slice(0, limit)
    .reverse();
}

function toTrend(performance: ExercisePerformance, today: CalendarDate): ExerciseTrendView | null {
  const sessions = comparableSessions(performance, TREND_SESSIONS);
  const values = sessions.map(trendValue);
  if (values.length < 2 || values.some((v) => v === null)) {
    return null;
  }
  const numbers = values as number[];
  const max = Math.max(...numbers);
  const change = Math.round((numbers[numbers.length - 1] - numbers[0]) * 100) / 100 + 0;
  return {
    bars: numbers.map((v) => (max > 0 ? v / max : 0)),
    change: formatTrendChange(change, unitOf(sessions[0])),
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same',
    since: copy.since(performedOnLabel(localDateOf(sessions[0].completedAt), today)),
  };
}

export function toExerciseRow(performance: ExercisePerformance, now: Date, catalog: ReadonlyMap<string, Exercise> = CATALOG): ExerciseRowView {
  const today = calendarDateOf(now);
  const latest = performance.sessions[0];
  const lastDate = localDateOf(latest.completedAt);
  const areas = [...new Set(catalog.get(performance.exerciseId)?.primaryMuscles.map((m) => MUSCLE_AREAS[m]) ?? [])];
  const trend = toTrend(performance, today);
  const latestText = formatPerformedSet(topSet(latest), latest.logging, latest.weightUnit);
  const lastLabel = performedOnLabel(lastDate, today);
  return {
    exerciseId: performance.exerciseId,
    name: performance.exerciseName,
    area: areas[0] ?? null,
    areas,
    latest: latestText,
    lastLabel,
    lastDate,
    trend,
    accessibleLabel: [
      performance.exerciseName,
      areas[0],
      copy.spokenLatest(latestText, lastLabel),
      trend ? copy.spokenTrend(trend.change, trend.since) : null,
    ]
      .filter(Boolean)
      .join('. '),
  };
}

// --- The list: search, area filter, sort ----------------------------------------------------

export type ExerciseSort = 'recent' | 'name';
export const ALL_AREAS = 'all';

export interface ExerciseListQuery {
  readonly search: string;
  /** A body area label ("Chest") or ALL_AREAS. */
  readonly area: string;
  readonly sort: ExerciseSort;
}

/** Areas present in the rows, in the catalog's display order, after "All". */
export function areaFilters(rows: readonly ExerciseRowView[]): readonly string[] {
  const order = [...new Set(Object.values(MUSCLE_AREAS))];
  const present = new Set(rows.flatMap((r) => r.areas));
  return [ALL_AREAS, ...order.filter((a) => present.has(a))];
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Search (name or area, case- and accent-insensitive) and area filter together, then sorted. */
export function queryExercises(rows: readonly ExerciseRowView[], query: ExerciseListQuery): ExerciseRowView[] {
  const words = normalize(query.search).split(/\s+/).filter(Boolean);
  const matches = rows.filter((row) => {
    if (query.area !== ALL_AREAS && !row.areas.includes(query.area)) {
      return false;
    }
    const haystack = normalize([row.name, ...row.areas].join(' '));
    return words.every((w) => haystack.includes(w));
  });
  return query.sort === 'name'
    ? matches.sort((a, b) => a.name.localeCompare(b.name, 'en'))
    : matches.sort((a, b) => compareCalendarDates(b.lastDate, a.lastDate));
}
