import { WeightEntry, sortWeightEntries } from '../body-measurements';
import {
  DEFAULT_CALCULATION_CONFIG,
  FitnessAssessment,
  FitnessCalculationConfig,
  GoalDirection,
  MacroTargets,
  calculateFitnessAssessment,
} from '../fitness-calculations';
import {
  IsoCalendarDate,
  MAINTENANCE_KCAL,
  UserFitnessProfile,
  parseIsoCalendarDate,
  toIsoCalendarDate,
} from '../fitness-profile';
import { FoodEntry, entriesBetween, entriesOn, sumNutrition } from '../nutrition';
import { LocalDateOf, addDays } from '../workout-session';

/**
 * Calorie Check-in: estimates real-world maintenance calories from the
 * user's own logged intake and weight trend over the same period, and
 * proposes a modest calorie-target change only when the evidence supports it.
 *
 * Method (energy balance):
 *   weight trend   = least-squares slope of every weigh-in in the period (kg/day)
 *   daily balance  = slope × kcalPerKg (≈ 7,700 kcal per kg of body-weight change)
 *   maintenance    = average logged intake − daily balance
 *   range          = ± max(minimum, 2 × standard error of the slope × kcalPerKg)
 *
 * A body-weight trend also reflects water, glycogen and gut contents, and
 * logged intake is usually somewhat incomplete; the window, minimums and the
 * range exist so that noise is reported as uncertainty, never as a result.
 *
 * Pure and deterministic: no Angular, storage or clock. Nothing is changed;
 * a proposal is only applied by the caller after explicit confirmation.
 */
export interface CheckInConfig {
  /**
   * Days analysed, ending yesterday (today's log is usually incomplete).
   * 28 days: long enough for a weight trend to emerge from day-to-day water
   * swings (often ±1 kg), short enough to reflect current habits.
   */
  readonly windowDays: number;
  /** Logged days needed (half of 28): an average over fewer days depends on which days were logged. */
  readonly minLoggedDays: number;
  /** Logged days needed in each half, so intake covers the same time as the weight trend. */
  readonly minLoggedDaysPerHalf: number;
  /** Distinct weigh-in days needed for a trend line (with a slope error estimate). */
  readonly minWeighInDays: number;
  /** Days between the first and last weigh-in: shorter trends are mostly water. */
  readonly minWeightSpanDays: number;
  /** Energy per kg of body-weight change (a common approximation for mixed tissue). */
  readonly kcalPerKg: number;
  /** The range is never narrower than this (logging error and the kcal/kg approximation). */
  readonly minRangeKcal: number;
  /** With a wider range (each side) the estimate is shown, but no change is proposed. */
  readonly maxRangeForAdviceKcal: number;
  /** With a wider range (each side) the weigh-ins are too irregular for any estimate. */
  readonly maxRangeForEstimateKcal: number;
  /** A proposal moves maintenance by at most this much per check-in. */
  readonly maxStepKcal: number;
  /** Target changes smaller than this aren't proposed. */
  readonly minChangeKcal: number;
  /** Days after an accepted adjustment before another is proposed. */
  readonly minDaysBetweenAdjustments: number;
  /** A trend within ± this (kg/week) is "stable". */
  readonly stableKgPerWeek: number;
  /** Plausible maintenance relative to the estimated BMR. Below 1× BMR usually means missing food logs. */
  readonly bmrMultiple: { readonly min: number; readonly max: number };
}

export const DEFAULT_CHECK_IN_CONFIG: CheckInConfig = {
  windowDays: 28,
  minLoggedDays: 14,
  minLoggedDaysPerHalf: 5,
  minWeighInDays: 4,
  minWeightSpanDays: 14,
  kcalPerKg: 7700,
  minRangeKcal: 150,
  maxRangeForAdviceKcal: 300,
  maxRangeForEstimateKcal: 500,
  maxStepKcal: 250,
  minChangeKcal: 100,
  minDaysBetweenAdjustments: 14,
  stableKgPerWeek: 0.1,
  bmrMultiple: { min: 1, max: 2.5 },
};

export interface CheckInPeriod {
  readonly from: IsoCalendarDate;
  readonly to: IsoCalendarDate;
  readonly days: number;
}

export interface IntakeObservation {
  /** Days with at least one food entry. Days without entries are not counted as zero. */
  readonly loggedDays: number;
  readonly firstHalfLoggedDays: number;
  readonly secondHalfLoggedDays: number;
  /** Average over logged days only (whole kcal); null when nothing was logged. */
  readonly averageKcal: number | null;
}

export interface WeightPoint {
  readonly date: IsoCalendarDate;
  readonly kilograms: number;
}

export interface WeightObservation {
  /** Every weigh-in in the period; same-day weigh-ins are kept, never averaged. */
  readonly weighIns: number;
  readonly weighInDays: number;
  /** Days from the first to the last weigh-in. */
  readonly spanDays: number;
  readonly first: WeightPoint | null;
  readonly last: WeightPoint | null;
  /** Trend line slope (kg/week, 2 decimals); null without at least two weigh-in days. */
  readonly kgPerWeek: number | null;
}

/** `weight-noise`: the weigh-ins vary too much around the trend for a usable estimate. */
export type MissingData = 'logged-days' | 'logging-spread' | 'weigh-ins' | 'weight-span' | 'weight-noise';

export type TrendDirection = 'losing' | 'stable' | 'gaining';

export type MaintenanceEstimate =
  | { readonly kind: 'insufficient'; readonly missing: readonly MissingData[] }
  /** The data gives a figure that isn't physiologically plausible (e.g. below BMR: food logs are probably incomplete). */
  | { readonly kind: 'implausible'; readonly reason: 'below-bmr' | 'above-range'; readonly kcal: number }
  | {
      readonly kind: 'estimate';
      /** Whole kcal/day, rounded to 10. */
      readonly kcal: number;
      readonly low: number;
      readonly high: number;
      /** Average daily surplus (+) or deficit (−) implied by the weight trend, rounded to 10. */
      readonly balanceKcal: number;
    };

/** The target as it is now, from the calculation engine. */
export type CurrentTarget =
  | { readonly kind: 'no-profile' }
  | { readonly kind: 'unavailable' }
  /** The engine withholds a calorie target (maintenance is below the product safety threshold). */
  | { readonly kind: 'review-required' }
  | {
      readonly kind: 'ready';
      readonly targetKcal: number;
      readonly floorApplied: boolean;
      readonly goalDirection: GoalDirection;
      readonly goalAdjustment: number;
      /** Estimated BMR (formula). Never used as maintenance. */
      readonly bmrKcal: number;
      /** The maintenance the target is built from now. */
      readonly maintenanceKcal: number;
      readonly maintenanceSource: 'formula' | 'check-in';
      /** When the current check-in calibration was accepted (ISO timestamp), and its local date. */
      readonly acceptedAt: string | null;
      readonly acceptedOn: IsoCalendarDate | null;
      readonly macros: MacroTargets;
    };

export type KeepReason =
  /** The current maintenance basis is inside the estimated range. */
  | 'consistent'
  /** The range is too wide to justify a change. */
  | 'too-uncertain'
  /** An adjustment was accepted recently; give it time to show. */
  | 'recently-adjusted'
  /** The change would be smaller than the minimum. */
  | 'small-change'
  /** The product safety threshold limits the target, so the data can't move it (or would withhold it). */
  | 'safety-threshold';

export type Recommendation =
  | { readonly kind: 'none'; readonly reason: 'insufficient-data' | 'implausible' | 'no-target' }
  | { readonly kind: 'keep'; readonly reason: KeepReason; readonly nextCheckInOn: IsoCalendarDate | null }
  | {
      readonly kind: 'adjust';
      /** The maintenance figure to save on confirmation. */
      readonly maintenanceKcal: number;
      /** The engine's target with that maintenance (goal adjustment and safety threshold applied). */
      readonly targetKcal: number;
      readonly changeKcal: number;
      /** The step was capped at maxStepKcal; a later check-in may move further. */
      readonly limited: boolean;
      readonly floorApplied: boolean;
      /** Macros recalculated by the engine for the new target. */
      readonly macros: MacroTargets;
    };

export interface CalorieCheckIn {
  readonly today: IsoCalendarDate;
  readonly period: CheckInPeriod;
  readonly intake: IntakeObservation;
  readonly weight: WeightObservation;
  readonly trend: TrendDirection | null;
  readonly maintenance: MaintenanceEstimate;
  readonly current: CurrentTarget;
  /** Is the weight trend in the goal's direction? null without a trend or target. */
  readonly onTrack: boolean | null;
  /** Average logged intake − current target (whole kcal); null without both. */
  readonly intakeVsTargetKcal: number | null;
  readonly recommendation: Recommendation;
}

export interface CheckInInput {
  readonly today: IsoCalendarDate;
  /** The user's local calendar date of an ISO instant (for when an adjustment was accepted). */
  readonly localDateOf: LocalDateOf;
  /** null: no profile; 'unavailable': it couldn't be read. */
  readonly profile: UserFitnessProfile | null | 'unavailable';
  readonly foods: readonly FoodEntry[];
  readonly weights: readonly WeightEntry[];
  readonly calculation?: FitnessCalculationConfig;
  readonly config?: CheckInConfig;
}

const DAY_MS = 86_400_000;
const round10 = (value: number) => Math.round(value / 10) * 10;
const shift = (date: IsoCalendarDate, days: number): IsoCalendarDate | null => {
  const parsed = parseIsoCalendarDate(date);
  return parsed ? toIsoCalendarDate(addDays(parsed, days)) : null;
};
const dayIndex = (date: IsoCalendarDate) => {
  const d = parseIsoCalendarDate(date)!;
  return Date.UTC(d.year, d.month - 1, d.day) / DAY_MS;
};

/** The analysed period: `windowDays` days ending yesterday. */
export function checkInPeriod(today: IsoCalendarDate, config: CheckInConfig = DEFAULT_CHECK_IN_CONFIG): CheckInPeriod | null {
  const to = shift(today, -1);
  const from = to && shift(to, -(config.windowDays - 1));
  return to && from ? { from, to, days: config.windowDays } : null;
}

export function observeIntake(foods: readonly FoodEntry[], period: CheckInPeriod): IntakeObservation {
  const inPeriod = entriesBetween(foods, period.from, period.to);
  const dates = [...new Set(inPeriod.map((e) => e.date))].sort();
  const midpoint = shift(period.from, Math.floor(period.days / 2))!;
  const total = dates.reduce((sum, date) => sum + sumNutrition(entriesOn(inPeriod, date)).calories, 0);
  return {
    loggedDays: dates.length,
    firstHalfLoggedDays: dates.filter((d) => d < midpoint).length,
    secondHalfLoggedDays: dates.filter((d) => d >= midpoint).length,
    averageKcal: dates.length ? Math.round(total / dates.length) : null,
  };
}

interface Fit {
  readonly slopePerDay: number;
  /** Standard error of the slope (kg/day); null with too few points for an error estimate. */
  readonly slopeError: number | null;
}

function fitLine(points: readonly WeightPoint[]): Fit | null {
  const xs = points.map((p) => dayIndex(p.date));
  const n = points.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = points.reduce((a, p) => a + p.kilograms, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
  if (sxx === 0) {
    return null;
  }
  const sxy = points.reduce((a, p, i) => a + (xs[i] - meanX) * (p.kilograms - meanY), 0);
  const slopePerDay = sxy / sxx;
  if (n < 3) {
    return { slopePerDay, slopeError: null };
  }
  const residuals = points.reduce((a, p, i) => a + (p.kilograms - (meanY + slopePerDay * (xs[i] - meanX))) ** 2, 0);
  return { slopePerDay, slopeError: Math.sqrt(residuals / (n - 2) / sxx) };
}

function observeWeight(weights: readonly WeightEntry[], period: CheckInPeriod): { observation: WeightObservation; fit: Fit | null } {
  const points: WeightPoint[] = sortWeightEntries(weights)
    .filter((e) => e.date >= period.from && e.date <= period.to && parseIsoCalendarDate(e.date) !== null && Number.isFinite(e.weight.kilograms))
    .map((e) => ({ date: e.date, kilograms: e.weight.kilograms }));
  const first = points[0] ?? null;
  const last = points[points.length - 1] ?? null;
  const fit = points.length >= 2 ? fitLine(points) : null;
  return {
    observation: {
      weighIns: points.length,
      weighInDays: new Set(points.map((p) => p.date)).size,
      spanDays: first && last ? dayIndex(last.date) - dayIndex(first.date) : 0,
      first,
      last,
      kgPerWeek: fit ? Math.round(fit.slopePerDay * 7 * 100) / 100 + 0 : null,
    },
    fit,
  };
}

function currentTarget(profile: CheckInInput['profile'], today: IsoCalendarDate, calculation: FitnessCalculationConfig, localDateOf: LocalDateOf): { current: CurrentTarget; assessment: FitnessAssessment | null } {
  if (profile === null) {
    return { current: { kind: 'no-profile' }, assessment: null };
  }
  if (profile === 'unavailable') {
    return { current: { kind: 'unavailable' }, assessment: null };
  }
  const result = calculateFitnessAssessment(profile, { asOfDate: today, config: calculation });
  if (!result.ok) {
    return { current: { kind: 'unavailable' }, assessment: null };
  }
  const a = result.value;
  if (a.targets.calories.status === 'review-required') {
    return { current: { kind: 'review-required' }, assessment: a };
  }
  const basis = a.explanation.maintenance;
  return {
    assessment: a,
    current: {
      kind: 'ready',
      targetKcal: a.targets.calories.finalKcal,
      floorApplied: a.targets.calories.status === 'floor-applied',
      goalDirection: a.goalDirection,
      goalAdjustment: a.explanation.goalAdjustment.fraction,
      bmrKcal: a.estimates.bmrKcal,
      maintenanceKcal: basis.kcal,
      maintenanceSource: basis.source,
      acceptedAt: basis.source === 'check-in' ? basis.acceptedAt : null,
      acceptedOn: basis.source === 'check-in' ? toIsoCalendarDate(localDateOf(basis.acceptedAt)) : null,
      macros: a.targets.macros,
    },
  };
}

function estimateMaintenance(
  intake: IntakeObservation,
  weight: WeightObservation,
  fit: Fit | null,
  bmrKcal: number | null,
  config: CheckInConfig,
): MaintenanceEstimate {
  const missing: MissingData[] = [];
  if (intake.loggedDays < config.minLoggedDays) {
    missing.push('logged-days');
  }
  if (intake.firstHalfLoggedDays < config.minLoggedDaysPerHalf || intake.secondHalfLoggedDays < config.minLoggedDaysPerHalf) {
    missing.push('logging-spread');
  }
  if (weight.weighInDays < config.minWeighInDays) {
    missing.push('weigh-ins');
  }
  if (weight.spanDays < config.minWeightSpanDays) {
    missing.push('weight-span');
  }
  if (missing.length || intake.averageKcal === null || !fit || fit.slopeError === null) {
    return { kind: 'insufficient', missing: missing.length ? missing : ['weigh-ins'] };
  }
  const half = round10(Math.max(config.minRangeKcal, 2 * fit.slopeError * config.kcalPerKg));
  if (half > config.maxRangeForEstimateKcal) {
    return { kind: 'insufficient', missing: ['weight-noise'] };
  }
  const balance = fit.slopePerDay * config.kcalPerKg;
  const raw = intake.averageKcal - balance;
  const kcal = round10(raw);
  const bounds =
    bmrKcal !== null
      ? { min: bmrKcal * config.bmrMultiple.min, max: bmrKcal * config.bmrMultiple.max }
      : MAINTENANCE_KCAL;
  if (raw < bounds.min || kcal < MAINTENANCE_KCAL.min) {
    return { kind: 'implausible', reason: 'below-bmr', kcal };
  }
  if (raw > bounds.max || kcal > MAINTENANCE_KCAL.max) {
    return { kind: 'implausible', reason: 'above-range', kcal };
  }
  return { kind: 'estimate', kcal, low: kcal - half, high: kcal + half, balanceKcal: round10(balance) + 0 };
}

function trendOf(kgPerWeek: number | null, config: CheckInConfig): TrendDirection | null {
  if (kgPerWeek === null) {
    return null;
  }
  return Math.abs(kgPerWeek) < config.stableKgPerWeek ? 'stable' : kgPerWeek < 0 ? 'losing' : 'gaining';
}

const ON_TRACK: Record<GoalDirection, TrendDirection> = { deficit: 'losing', maintenance: 'stable', surplus: 'gaining' };

function recommend(
  input: CheckInInput,
  estimate: MaintenanceEstimate,
  current: CurrentTarget,
  config: CheckInConfig,
  calculation: FitnessCalculationConfig,
): Recommendation {
  if (estimate.kind === 'insufficient') {
    return { kind: 'none', reason: 'insufficient-data' };
  }
  if (estimate.kind === 'implausible') {
    return { kind: 'none', reason: 'implausible' };
  }
  if (current.kind !== 'ready' || typeof input.profile !== 'object' || input.profile === null) {
    return { kind: 'none', reason: 'no-target' };
  }
  if (current.acceptedOn) {
    const next = shift(current.acceptedOn, config.minDaysBetweenAdjustments);
    if (next && input.today < next) {
      return { kind: 'keep', reason: 'recently-adjusted', nextCheckInOn: next };
    }
  }
  if (estimate.high - estimate.kcal > config.maxRangeForAdviceKcal) {
    return { kind: 'keep', reason: 'too-uncertain', nextCheckInOn: null };
  }
  if (current.maintenanceKcal >= estimate.low && current.maintenanceKcal <= estimate.high) {
    return { kind: 'keep', reason: 'consistent', nextCheckInOn: null };
  }
  const step = Math.max(-config.maxStepKcal, Math.min(config.maxStepKcal, estimate.kcal - current.maintenanceKcal));
  const maintenanceKcal = Math.round(current.maintenanceKcal + step);
  const period = checkInPeriod(input.today, config)!;
  const proposed = calculateFitnessAssessment(
    { ...input.profile, energyCalibration: { maintenanceKcal, observedFrom: period.from, observedTo: period.to, acceptedAt: new Date(0).toISOString() } },
    { asOfDate: input.today, config: calculation },
  );
  if (!proposed.ok || proposed.value.targets.calories.status === 'review-required') {
    return { kind: 'keep', reason: 'safety-threshold', nextCheckInOn: null };
  }
  const targetKcal = proposed.value.targets.calories.finalKcal;
  const changeKcal = targetKcal - current.targetKcal;
  if (Math.abs(changeKcal) < config.minChangeKcal) {
    const floored = proposed.value.targets.calories.status === 'floor-applied';
    return { kind: 'keep', reason: floored ? 'safety-threshold' : 'small-change', nextCheckInOn: null };
  }
  return {
    kind: 'adjust',
    maintenanceKcal,
    targetKcal,
    changeKcal,
    limited: maintenanceKcal !== estimate.kcal,
    floorApplied: proposed.value.targets.calories.status === 'floor-applied',
    macros: proposed.value.targets.macros,
  };
}

/** The full check-in for `today`, or null for an invalid date. */
export function calorieCheckIn(input: CheckInInput): CalorieCheckIn | null {
  const config = input.config ?? DEFAULT_CHECK_IN_CONFIG;
  const calculation = input.calculation ?? DEFAULT_CALCULATION_CONFIG;
  const period = checkInPeriod(input.today, config);
  if (!period) {
    return null;
  }
  const intake = observeIntake(input.foods, period);
  const { observation: weight, fit } = observeWeight(input.weights, period);
  const { current, assessment } = currentTarget(input.profile, input.today, calculation, input.localDateOf);
  const maintenance = estimateMaintenance(intake, weight, fit, assessment?.estimates.bmrKcal ?? null, config);
  const trend = maintenance.kind === 'insufficient' ? null : trendOf(weight.kgPerWeek, config);
  return {
    today: input.today,
    period,
    intake,
    weight,
    trend,
    maintenance,
    current,
    onTrack: trend && current.kind === 'ready' ? ON_TRACK[current.goalDirection] === trend : null,
    intakeVsTargetKcal: intake.averageKcal !== null && current.kind === 'ready' ? intake.averageKcal - current.targetKcal : null,
    recommendation: recommend(input, maintenance, current, config, calculation),
  };
}
