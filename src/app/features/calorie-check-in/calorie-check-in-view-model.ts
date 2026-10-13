import { CheckInSnapshot } from '../../core/calorie-check-in/calorie-check-in.service';
import { CalorieCheckIn, DEFAULT_CHECK_IN_CONFIG, KeepReason, MissingData, Recommendation } from '../../domain/calorie-check-in';
import { MacroTargets } from '../../domain/fitness-calculations';
import { IsoCalendarDate, UnitSystem, parseIsoCalendarDate, weightInUnit, weightUnitLabel } from '../../domain/fitness-profile';
import { formatKcal } from '../nutrition/nutrition-view-model';
import { weekRangeLabel } from '../nutrition/nutrition-week-view-model';
import { CHECK_IN_COPY } from './calorie-check-in-content';

/**
 * Presentation of the Calorie Check-in. Every number comes from the domain
 * check-in (calorie-check-in); this only words and formats it, keeping what
 * was measured, what is estimated and what is proposed visibly apart.
 */

const copy = CHECK_IN_COPY;
const config = DEFAULT_CHECK_IN_CONFIG;
const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const oneDecimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

const kcal = (value: number) => `${formatKcal(value)} kcal`;
const perDay = (value: number) => `${formatKcal(value)} kcal a day`;
const shortDate = (iso: IsoCalendarDate) => {
  const d = parseIsoCalendarDate(iso);
  return d ? monthDay.format(new Date(Date.UTC(d.year, d.month - 1, d.day))) : iso;
};
/** "+120" / "−213" (true minus sign). */
const signed = (value: number) => (value > 0 ? `+${formatKcal(value)}` : value < 0 ? `−${formatKcal(-value)}` : '0');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const weightRate = (kgPerWeek: number, unitSystem: UnitSystem) => {
  const value = weightInUnit({ kilograms: Math.abs(kgPerWeek) }, unitSystem);
  const sign = kgPerWeek > 0 ? '+' : kgPerWeek < 0 ? '−' : '';
  return `${sign}${twoDecimals.format(Math.round(value * 100) / 100)} ${weightUnitLabel(unitSystem)} a week`;
};
const weight = (kilograms: number, unitSystem: UnitSystem) => `${oneDecimal.format(weightInUnit({ kilograms }, unitSystem))} ${weightUnitLabel(unitSystem)}`;

export type CheckInLink = 'log-food' | 'log-weight' | 'weight-history';

export interface ObservedRow {
  readonly key: 'intake' | 'weight' | 'target';
  readonly label: string;
  readonly value: string;
  readonly detail: string | null;
}

export type EstimateView =
  | {
      readonly kind: 'estimate';
      readonly value: string;
      readonly range: string;
      /** How the figure was derived, in words with the actual numbers. */
      readonly how: readonly string[];
    }
  | { readonly kind: 'insufficient'; readonly items: readonly { readonly key: MissingData; readonly text: string; readonly link: CheckInLink | null }[] }
  | { readonly kind: 'implausible'; readonly message: string };

export interface ProposalView {
  readonly title: string;
  readonly reason: string;
  readonly limitedNote: string | null;
  readonly current: string;
  readonly next: string;
  readonly macros: readonly { readonly key: string; readonly label: string; readonly value: string }[] | null;
  /** What the user confirmed (exactly as shown). */
  readonly confirm: { readonly maintenanceKcal: number; readonly targetKcal: number };
}

export interface RecommendationView {
  /** Is the trend in the goal's direction (a sentence), when known. */
  readonly trendNote: string | null;
  readonly kind: 'adjust' | 'keep' | 'none';
  readonly message: string;
  readonly proposal: ProposalView | null;
}

export interface CheckInScreen {
  readonly period: string;
  readonly observed: readonly ObservedRow[];
  readonly intakeVsTarget: string | null;
  readonly estimate: EstimateView;
  readonly recommendation: RecommendationView;
  /** A check-in calibration is in use: offer the formula target again. */
  readonly canUseFormula: boolean;
  readonly targetSource: string | null;
}

// --- Observed ---------------------------------------------------------------------

function observed(c: CalorieCheckIn, unitSystem: UnitSystem): ObservedRow[] {
  const { intake, weight: w, current } = c;
  const rows: ObservedRow[] = [
    {
      key: 'intake',
      label: copy.observed.intake,
      value: intake.averageKcal !== null ? perDay(intake.averageKcal) : 'No food logged',
      detail: `Food logged on ${intake.loggedDays} of ${plural(c.period.days, 'day', 'days')}; days without entries aren’t counted`,
    },
    {
      key: 'weight',
      label: copy.observed.weight,
      value: w.kgPerWeek !== null && c.maintenance.kind !== 'insufficient' ? weightRate(w.kgPerWeek, unitSystem) : w.weighIns ? 'No trend yet' : 'No weigh-ins',
      detail:
        w.first && w.last && w.weighIns > 1
          ? `${plural(w.weighIns, 'weigh-in', 'weigh-ins')}: ${weight(w.first.kilograms, unitSystem)} on ${shortDate(w.first.date)} → ${weight(w.last.kilograms, unitSystem)} on ${shortDate(w.last.date)}`
          : w.weighIns === 1
            ? '1 weigh-in'
            : null,
    },
  ];
  rows.push({
    key: 'target',
    label: copy.observed.target,
    value: current.kind === 'ready' ? perDay(current.targetKcal) : copy.observed.noTarget,
    detail: targetDetail(c),
  });
  return rows;
}

function targetDetail(c: CalorieCheckIn): string | null {
  switch (c.current.kind) {
    case 'ready':
      return c.current.floorApplied ? 'Set at the app’s minimum calorie target' : null;
    case 'no-profile':
      return 'Set up your profile to get a calorie target.';
    case 'review-required':
      return 'Your calorie target is on hold and needs review.';
    case 'unavailable':
      return 'Your profile couldn’t be read.';
  }
}

function targetSource(c: CalorieCheckIn): string | null {
  if (c.current.kind !== 'ready') {
    return null;
  }
  if (c.current.maintenanceSource === 'check-in' && c.current.acceptedOn) {
    return `Based on maintenance of ${perDay(c.current.maintenanceKcal)} from your check-in on ${shortDate(c.current.acceptedOn)}.`;
  }
  return `Based on the estimated maintenance of ${perDay(c.current.maintenanceKcal)} calculated from your profile.`;
}

// --- Estimate ---------------------------------------------------------------------

const MISSING: Record<MissingData, (c: CalorieCheckIn) => { text: string; link: CheckInLink | null }> = {
  'logged-days': (c) => ({
    text: `Log food on at least ${config.minLoggedDays} of the ${c.period.days} days (${c.intake.loggedDays} so far).`,
    link: 'log-food',
  }),
  'logging-spread': () => ({
    text: `Log food in both halves of the period (at least ${config.minLoggedDaysPerHalf} days in each), so intake covers the same time as your weight trend.`,
    link: 'log-food',
  }),
  'weigh-ins': (c) => ({
    text: `Weigh in on at least ${config.minWeighInDays} different days (${c.weight.weighInDays} so far).`,
    link: 'log-weight',
  }),
  'weight-span': () => ({
    text: `Spread weigh-ins over at least ${config.minWeightSpanDays} days; shorter changes are mostly water.`,
    link: 'log-weight',
  }),
  'weight-noise': () => ({
    text: 'Your weigh-ins vary too much to show a clear trend. Weighing in more often, at the same time of day, helps.',
    link: 'weight-history',
  }),
};

function estimate(c: CalorieCheckIn, unitSystem: UnitSystem): EstimateView {
  const m = c.maintenance;
  switch (m.kind) {
    case 'insufficient':
      return { kind: 'insufficient', items: m.missing.map((key) => ({ key, ...MISSING[key](c) })) };
    case 'implausible':
      return {
        kind: 'implausible',
        message:
          m.reason === 'below-bmr'
            ? 'Your logged intake and weight trend suggest maintenance below what your body uses at rest, which usually means some food wasn’t logged. Log everything you eat for a couple of weeks and check in again.'
            : 'Your logged intake and weight trend suggest an unusually high maintenance. Check for duplicate or mistyped food entries and weigh-ins.',
      };
    case 'estimate': {
      const rate = c.weight.kgPerWeek ?? 0;
      const balance = m.balanceKcal;
      const direction = balance < 0 ? `a deficit of about ${kcal(-balance)} a day` : balance > 0 ? `a surplus of about ${kcal(balance)} a day` : 'no daily surplus or deficit';
      return {
        kind: 'estimate',
        value: perDay(m.kcal),
        range: `Likely between ${formatKcal(m.low)} and ${kcal(m.high)}`,
        how: [
          `You logged an average of ${perDay(c.intake.averageKcal ?? 0)} on ${plural(c.intake.loggedDays, 'day', 'days')}.`,
          `Your weight trend of ${weightRate(rate, unitSystem)} (a line through ${plural(c.weight.weighIns, 'weigh-in', 'weigh-ins')}) suggests ${direction}, using about ${formatKcal(config.kcalPerKg)} kcal per kg of body weight.`,
          `Maintenance ≈ intake − that difference ≈ ${perDay(m.kcal)}. The range reflects how closely your weigh-ins follow the trend, and is never narrower than ±${config.minRangeKcal} kcal.`,
        ],
      };
    }
  }
}

// --- Recommendation ----------------------------------------------------------------

const KEEP: Record<KeepReason, (c: CalorieCheckIn, next: IsoCalendarDate | null) => string> = {
  consistent: () => 'Keep your current target: it’s built on a maintenance figure inside your estimated range.',
  'too-uncertain': () => 'Keep your current target for now: the range is too wide to justify a change. More regular weigh-ins will narrow it.',
  'recently-adjusted': (_, next) => `Keep your current target: you changed it recently. Give it time to show in your weight and check in again${next ? ` from ${shortDate(next)}` : ''}.`,
  'small-change': () => 'Keep your current target: the data points to a change too small to matter.',
  'safety-threshold': () => 'Keep your current target: the app’s minimum calorie target limits it, so this data can’t lower it further.',
};

const NONE: Record<Extract<Recommendation, { kind: 'none' }>['reason'], string> = {
  'insufficient-data': 'Keep your current target and keep logging. A suggestion needs the data listed above.',
  implausible: 'No change is suggested from data that doesn’t add up.',
  'no-target': 'There’s no valid calorie target to compare with, so no change is suggested.',
};

const GOAL_TREND: Record<'deficit' | 'maintenance' | 'surplus', string> = { deficit: 'fat-loss goal', maintenance: 'goal of keeping your weight steady', surplus: 'muscle-gain goal' };

function trendNote(c: CalorieCheckIn): string | null {
  if (c.trend === null || c.current.kind !== 'ready' || c.onTrack === null) {
    return null;
  }
  const trend = c.trend === 'losing' ? 'trending down' : c.trend === 'gaining' ? 'trending up' : 'about steady';
  return `Your weight is ${trend}, ${c.onTrack ? 'in line with' : 'not in line with'} your ${GOAL_TREND[c.current.goalDirection]}.`;
}

function macrosView(macros: MacroTargets): ProposalView['macros'] {
  if (macros.status === 'infeasible') {
    return null;
  }
  return [
    { key: 'protein', label: 'Protein', value: `${macros.proteinGrams} g` },
    { key: 'carbohydrate', label: 'Carbohydrates', value: `${macros.carbohydrateGrams} g` },
    { key: 'fat', label: 'Fat', value: `${macros.fatGrams} g` },
  ];
}

function recommendation(c: CalorieCheckIn): RecommendationView {
  const r = c.recommendation;
  const note = trendNote(c);
  if (r.kind === 'none') {
    return { trendNote: note, kind: 'none', message: NONE[r.reason], proposal: null };
  }
  if (r.kind === 'keep') {
    return { trendNote: note, kind: 'keep', message: KEEP[r.reason](c, r.nextCheckInOn), proposal: null };
  }
  const current = c.current.kind === 'ready' ? c.current : null;
  const lower = r.changeKcal < 0;
  const estimateKcal = c.maintenance.kind === 'estimate' ? c.maintenance.kcal : r.maintenanceKcal;
  return {
    trendNote: note,
    kind: 'adjust',
    message: `${lower ? 'Lower' : 'Raise'} your target to ${perDay(r.targetKcal)} (${signed(r.changeKcal)} kcal).`,
    proposal: {
      title: `${lower ? 'Lower' : 'Raise'} to ${perDay(r.targetKcal)}`,
      reason: `Your estimated maintenance (${perDay(estimateKcal)}) is ${lower ? 'lower' : 'higher'} than the ${perDay(current?.maintenanceKcal ?? 0)} your target is built on now. The new target applies your goal to ${perDay(r.maintenanceKcal)}${r.floorApplied ? ', limited by the app’s minimum calorie target' : ''}.`,
      limitedNote: r.limited ? `The change is limited to ${formatKcal(config.maxStepKcal)} kcal of maintenance per check-in, so a later check-in may suggest more.` : null,
      current: current ? perDay(current.targetKcal) : copy.observed.noTarget,
      next: perDay(r.targetKcal),
      macros: macrosView(r.macros),
      confirm: { maintenanceKcal: r.maintenanceKcal, targetKcal: r.targetKcal },
    },
  };
}

export function toCheckInScreen(snapshot: CheckInSnapshot): CheckInScreen {
  const { checkIn: c, unitSystem } = snapshot;
  return {
    period: `${weekRangeLabel(c.period.from, c.period.to)} · last ${c.period.days / 7} weeks`,
    observed: observed(c, unitSystem),
    intakeVsTarget:
      c.intakeVsTargetKcal !== null && c.maintenance.kind !== 'insufficient'
        ? Math.abs(c.intakeVsTargetKcal) < 50
          ? 'You ate close to your target on average.'
          : `On average you logged ${kcal(Math.abs(c.intakeVsTargetKcal))} a day ${c.intakeVsTargetKcal < 0 ? 'below' : 'above'} your target, so your weight reflects that intake.`
        : null,
    estimate: estimate(c, unitSystem),
    recommendation: recommendation(c),
    canUseFormula: c.current.kind === 'ready' && c.current.maintenanceSource === 'check-in',
    targetSource: targetSource(c),
  };
}
