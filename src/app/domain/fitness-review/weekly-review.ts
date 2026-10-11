import { BodyCompositionAssessment, KEY_BODY_COMPOSITION_METRICS, MetricChange, metricChange } from '../body-composition';
import { MEASUREMENT_SITES, MeasurementEntry, SiteChange, WeightEntry, siteChange, sortWeightEntries } from '../body-measurements';
import { IsoCalendarDate, UnitSystem, parseIsoCalendarDate, roundTo, toIsoCalendarDate, weightInUnit } from '../fitness-profile';
import { NutritionValues, NutritionWeek } from '../nutrition';
import { LocalDateOf, WorkoutLog, addDays, completedWorkouts, isTrainingWorkout } from '../workout-session';
import { ExerciseTrend, ExerciseTrends, exerciseTrends } from './exercise-trends';

/**
 * Weekly Fitness Review V1: a deterministic review of one Monday–Sunday week
 * from the user's own records, and a short, prioritised action list. Every
 * conclusion comes from recorded data or an explicit rule below; missing
 * data is reported as missing, never filled in.
 */

// --- Rules -----------------------------------------------------------------------------------

/** Weight trend window: the 28 days ending on the reviewed week's Sunday. */
export const WEIGHT_WINDOW_DAYS = 28;
/** Measurement and report changes shown only when the latest reading is this recent. */
export const BODY_RECENT_DAYS = 56;
/** Averages need at least this many logged days before a nutrition action is suggested. */
export const MIN_LOGGED_DAYS_FOR_NUTRITION_ACTION = 3;
/** Protein below this share of a valid target counts as a gap. */
export const PROTEIN_GAP_SHARE = 0.9;
/** Food logged on fewer than this share of the week's days so far: suggest logging more. */
export const LOGGING_COVERAGE_SHARE = 0.6;
/** Fewer weigh-ins than this in the last two weeks: suggest weighing in. */
export const MIN_RECENT_WEIGH_INS = 2;
/** No tape measurement for this many days: suggest measuring. */
export const MEASUREMENT_STALE_DAYS = 28;
/** At most this many actions, in priority order. */
export const MAX_ACTIONS = 3;

// --- Input / output --------------------------------------------------------------------------

/** A source that couldn't be read is `null`: its section says so, others still work. */
export interface WeeklyReviewInput {
  /** Monday of the reviewed week. */
  readonly weekStart: IsoCalendarDate;
  /** The user's local date. */
  readonly today: IsoCalendarDate;
  readonly unitSystem: UnitSystem;
  readonly localDateOf: LocalDateOf;
  readonly training: { readonly logs: readonly WorkoutLog[]; readonly plannedPerWeek: number | null } | null;
  readonly nutrition: {
    readonly week: NutritionWeek;
    /** Valid daily targets only; null when withheld or unavailable (never guessed). */
    readonly calorieTarget: number | null;
    readonly proteinTarget: number | null;
  } | null;
  readonly weights: readonly WeightEntry[] | null;
  readonly measurements: readonly MeasurementEntry[] | null;
  readonly bodyComposition: readonly BodyCompositionAssessment[] | null;
}

export type Section<T> = ({ readonly kind: 'ready' } & T) | { readonly kind: 'unavailable' };

export interface TrainingSection {
  readonly completed: number;
  /** Resistance sessions the current plan schedules per week; null without a plan. */
  readonly planned: number | null;
  readonly trends: ExerciseTrends;
}

export interface NutritionSection {
  readonly loggedDays: number;
  readonly elapsedDays: number;
  /** Over logged days (the weekly summary's rule); null when nothing was logged. */
  readonly average: NutritionValues | null;
  readonly calorieTarget: number | null;
  readonly proteinTarget: number | null;
}

export type WeightTrend =
  | {
      readonly kind: 'change';
      readonly first: WeightEntry;
      readonly last: WeightEntry;
      /** last − first in the display unit (1 decimal), from displayed values. */
      readonly change: number;
      readonly entries: number;
    }
  /** Fewer than two weigh-ins on different days in the window. */
  | { readonly kind: 'insufficient'; readonly entries: number };

export interface BodySection {
  readonly weight: Section<{ readonly trend: WeightTrend; readonly windowStart: IsoCalendarDate }>;
  /** Sites whose two latest readings are comparable and recent. */
  readonly measurements: Section<{ readonly changes: readonly SiteChange[]; readonly latestDate: IsoCalendarDate | null }>;
  /** Key InBody metrics with two reports (each metric on its own; units never converted). */
  readonly composition: Section<{ readonly changes: readonly MetricChange[]; readonly reports: number }>;
}

export type ReviewAction =
  | { readonly id: 'complete-workouts'; readonly completed: number; readonly planned: number; readonly current: boolean }
  | { readonly id: 'protein'; readonly average: number; readonly target: number; readonly loggedDays: number }
  | { readonly id: 'log-food'; readonly loggedDays: number; readonly elapsedDays: number }
  | { readonly id: 'review-exercise'; readonly trend: ExerciseTrend }
  | { readonly id: 'weigh-in'; readonly recentWeighIns: number }
  | { readonly id: 'measure'; readonly lastMeasured: IsoCalendarDate | null };

export interface WeeklyReview {
  readonly weekStart: IsoCalendarDate;
  readonly weekEnd: IsoCalendarDate;
  /** The reviewed week contains today (days after today haven't happened yet). */
  readonly current: boolean;
  readonly training: Section<TrainingSection>;
  readonly nutrition: Section<NutritionSection>;
  readonly body: BodySection;
  /** Prioritised, at most MAX_ACTIONS; each traceable to the data above. */
  readonly actions: readonly ReviewAction[];
}

// --- Review ----------------------------------------------------------------------------------

const shiftDate = (date: IsoCalendarDate, days: number): IsoCalendarDate => {
  const parsed = parseIsoCalendarDate(date);
  return parsed ? (toIsoCalendarDate(addDays(parsed, days)) ?? date) : date;
};

function trainingSection(input: WeeklyReviewInput, weekEnd: IsoCalendarDate): Section<TrainingSection> {
  if (!input.training) {
    return { kind: 'unavailable' };
  }
  const { logs, plannedPerWeek } = input.training;
  const dateOf = (instant: string) => toIsoCalendarDate(input.localDateOf(instant));
  const completed = completedWorkouts(logs)
    .filter(isTrainingWorkout)
    .filter((log) => {
      const date = dateOf(log.completedAt as string);
      return date !== null && date >= input.weekStart && date <= weekEnd;
    }).length;
  return { kind: 'ready', completed, planned: plannedPerWeek, trends: exerciseTrends(logs, input.weekStart, weekEnd, input.localDateOf) };
}

function nutritionSection(input: WeeklyReviewInput): Section<NutritionSection> {
  if (!input.nutrition) {
    return { kind: 'unavailable' };
  }
  const { week, calorieTarget, proteinTarget } = input.nutrition;
  return { kind: 'ready', loggedDays: week.loggedDays, elapsedDays: week.elapsedDays, average: week.average, calorieTarget, proteinTarget };
}

function weightTrend(entries: readonly WeightEntry[], from: IsoCalendarDate, to: IsoCalendarDate, unitSystem: UnitSystem): WeightTrend {
  const inWindow = sortWeightEntries(entries.filter((e) => e.date >= from && e.date <= to));
  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  if (!first || !last || first.date === last.date) {
    return { kind: 'insufficient', entries: inWindow.length };
  }
  const change = roundTo(weightInUnit(last.weight, unitSystem) - weightInUnit(first.weight, unitSystem), 1) + 0;
  return { kind: 'change', first, last, change, entries: inWindow.length };
}

function bodySection(input: WeeklyReviewInput, weekEnd: IsoCalendarDate): BodySection {
  const recentFrom = shiftDate(weekEnd, -(BODY_RECENT_DAYS - 1));
  const windowStart = shiftDate(weekEnd, -(WEIGHT_WINDOW_DAYS - 1));
  const weight: BodySection['weight'] = input.weights
    ? { kind: 'ready', trend: weightTrend(input.weights, windowStart, weekEnd, input.unitSystem), windowStart }
    : { kind: 'unavailable' };

  let measurements: BodySection['measurements'] = { kind: 'unavailable' };
  if (input.measurements) {
    const known = input.measurements.filter((e) => e.date <= weekEnd);
    const changes = MEASUREMENT_SITES.map((site) => siteChange(known, site, input.unitSystem)).filter(
      (c): c is SiteChange => c !== null && c.latest.date >= recentFrom,
    );
    const latestDate = known.reduce<IsoCalendarDate | null>((d, e) => (d === null || e.date > d ? e.date : d), null);
    measurements = { kind: 'ready', changes, latestDate };
  }

  let composition: BodySection['composition'] = { kind: 'unavailable' };
  if (input.bodyComposition) {
    const known = input.bodyComposition.filter((a) => a.date <= weekEnd);
    const changes = KEY_BODY_COMPOSITION_METRICS.map((metric) => metricChange(known, metric)).filter(
      (c): c is MetricChange => c !== null && c.latest.date >= recentFrom,
    );
    composition = { kind: 'ready', changes, reports: known.length };
  }
  return { weight, measurements, composition };
}

/** The action list: each rule in priority order, at most MAX_ACTIONS. */
function actionsFor(input: WeeklyReviewInput, review: Omit<WeeklyReview, 'actions'>): ReviewAction[] {
  const actions: ReviewAction[] = [];
  const t = review.training;
  if (t.kind === 'ready' && t.planned !== null && t.planned > 0 && t.completed < t.planned) {
    actions.push({ id: 'complete-workouts', completed: t.completed, planned: t.planned, current: review.current });
  }
  const n = review.nutrition;
  if (n.kind === 'ready') {
    const protein = n.average?.proteinGrams ?? null;
    if (n.proteinTarget !== null && protein !== null && n.loggedDays >= MIN_LOGGED_DAYS_FOR_NUTRITION_ACTION && protein < n.proteinTarget * PROTEIN_GAP_SHARE) {
      actions.push({ id: 'protein', average: protein, target: n.proteinTarget, loggedDays: n.loggedDays });
    }
    if (n.elapsedDays >= MIN_LOGGED_DAYS_FOR_NUTRITION_ACTION && n.loggedDays < Math.ceil(n.elapsedDays * LOGGING_COVERAGE_SHARE)) {
      actions.push({ id: 'log-food', loggedDays: n.loggedDays, elapsedDays: n.elapsedDays });
    }
  }
  if (t.kind === 'ready' && t.trends.stalled.length > 0) {
    actions.push({ id: 'review-exercise', trend: t.trends.stalled[0] });
  }
  if (input.weights) {
    const twoWeeksFrom = shiftDate(review.weekEnd, -13);
    const recentWeighIns = input.weights.filter((e) => e.date >= twoWeeksFrom && e.date <= review.weekEnd).length;
    if (recentWeighIns < MIN_RECENT_WEIGH_INS) {
      actions.push({ id: 'weigh-in', recentWeighIns });
    }
  }
  const m = review.body.measurements;
  if (m.kind === 'ready' && (m.latestDate === null || m.latestDate < shiftDate(review.weekEnd, -(MEASUREMENT_STALE_DAYS - 1)))) {
    actions.push({ id: 'measure', lastMeasured: m.latestDate });
  }
  return actions.slice(0, MAX_ACTIONS);
}

/** Null when `weekStart` isn't a valid date. */
export function weeklyReview(input: WeeklyReviewInput): WeeklyReview | null {
  if (!parseIsoCalendarDate(input.weekStart)) {
    return null;
  }
  const weekEnd = shiftDate(input.weekStart, 6);
  const base = {
    weekStart: input.weekStart,
    weekEnd,
    current: input.today >= input.weekStart && input.today <= weekEnd,
    training: trainingSection(input, weekEnd),
    nutrition: nutritionSection(input),
    body: bodySection(input, weekEnd),
  };
  return { ...base, actions: actionsFor(input, base) };
}
