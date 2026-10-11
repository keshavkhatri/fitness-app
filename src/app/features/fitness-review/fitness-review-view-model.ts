import { WeeklyReviewSnapshot } from '../../core/fitness-review/fitness-review.service';
import { lengthUnitLabel } from '../../domain/body-measurements';
import { ExerciseTrend, ReviewAction, STALL_WINDOW, WEIGHT_WINDOW_DAYS, WeeklyReview } from '../../domain/fitness-review';
import { IsoCalendarDate, UnitSystem, parseIsoCalendarDate, weightInUnit, weightUnitLabel } from '../../domain/fitness-profile';
import { BODY_COMPOSITION_COPY } from '../body-composition/body-composition-content';
import { MEASUREMENT_COPY } from '../body-measurements/measurement-content';
import { formatKcal, formatGrams, toIntakeSummary } from '../nutrition/nutrition-view-model';
import { WeekHeaderView, toWeekHeader } from '../nutrition/nutrition-week-view-model';
import { formatPerformedSet } from '../workout/progress/progress-view-model';
import { FITNESS_REVIEW_COPY } from './fitness-review-content';

/**
 * Presentation of the Weekly Fitness Review. Every figure comes from the
 * domain review (fitness-review); this only words and formats it.
 */

const copy = FITNESS_REVIEW_COPY;
const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const oneDecimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const shortDate = (iso: IsoCalendarDate) => {
  const d = parseIsoCalendarDate(iso);
  return d ? monthDay.format(new Date(Date.UTC(d.year, d.month - 1, d.day))) : iso;
};
/** "+0.4" / "−0.7" (true minus sign) / "0.0". */
const signed = (value: number, digits = 1) => {
  const text = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(value));
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Where an insight or action can be acted on. */
export type ReviewLink =
  | { readonly kind: 'workout' }
  | { readonly kind: 'nutrition' }
  | { readonly kind: 'nutrition-week'; readonly date: IsoCalendarDate }
  | { readonly kind: 'exercise'; readonly exerciseId: string }
  | { readonly kind: 'weigh-in' }
  | { readonly kind: 'measure' }
  | { readonly kind: 'weight-history' }
  | { readonly kind: 'measurements' }
  | { readonly kind: 'body-composition' };

export interface LinkView {
  readonly label: string;
  readonly target: ReviewLink;
}

export interface ActionView {
  readonly id: ReviewAction['id'];
  readonly title: string;
  /** Why it was selected: the data behind it. */
  readonly reason: string;
  readonly link: LinkView;
}

export interface StatView {
  readonly key: 'workouts' | 'food' | 'weight';
  readonly label: string;
  readonly value: string;
}

export interface TrendItemView {
  readonly exerciseId: string;
  readonly name: string;
  readonly detail: string;
}

export interface ChangeItemView {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}

export type TrainingView =
  | { readonly kind: 'unavailable' }
  | {
      readonly kind: 'ready';
      readonly summary: string;
      readonly improving: readonly TrendItemView[];
      readonly stalled: readonly TrendItemView[];
      readonly notEnough: string | null;
      readonly showRule: boolean;
    };

export type NutritionView =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'empty'; readonly coverage: string }
  | {
      readonly kind: 'ready';
      readonly coverage: string;
      readonly rows: readonly { readonly key: 'calories' | 'protein'; readonly label: string; readonly value: string; readonly target: string | null }[];
      readonly targetNote: string | null;
      readonly link: LinkView;
    };

export interface BodyView {
  readonly weight: { readonly kind: 'unavailable' } | { readonly kind: 'ready'; readonly text: string; readonly detail: string | null };
  readonly measurements: { readonly kind: 'unavailable' } | { readonly kind: 'ready'; readonly items: readonly ChangeItemView[] };
  readonly composition: { readonly kind: 'unavailable' } | { readonly kind: 'ready'; readonly items: readonly ChangeItemView[] };
}

export interface ReviewScreen {
  readonly header: WeekHeaderView;
  readonly current: boolean;
  readonly summary: string;
  readonly stats: readonly StatView[];
  readonly actionsTitle: string;
  readonly actions: readonly ActionView[];
  readonly training: TrainingView;
  readonly nutrition: NutritionView;
  readonly body: BodyView;
}

// --- Sections -------------------------------------------------------------------------------

const topSetText = (t: ExerciseTrend, which: 'latest' | 'reference') => formatPerformedSet(t[which], t.logging, t.weightUnit);

function trainingView(review: WeeklyReview): TrainingView {
  const t = review.training;
  if (t.kind === 'unavailable') {
    return { kind: 'unavailable' };
  }
  const workouts = t.planned !== null ? `${t.completed} of ${plural(t.planned, 'planned workout', 'planned workouts')}` : plural(t.completed, 'workout', 'workouts');
  const summary = t.completed === 0 && t.planned === null ? copy.training.none : `${workouts} finished${review.current ? ` ${copy.soFar}` : ''}.`;
  return {
    kind: 'ready',
    summary,
    improving: t.trends.improving.slice(0, 3).map((x) => ({
      exerciseId: x.exerciseId,
      name: x.exerciseName,
      detail: `${topSetText(x, 'latest')}, up from ${topSetText(x, 'reference')}`,
    })),
    stalled: t.trends.stalled.slice(0, 3).map((x) => ({
      exerciseId: x.exerciseId,
      name: x.exerciseName,
      detail: `No better top set than ${topSetText(x, 'reference')} in the last ${STALL_WINDOW} comparable sessions`,
    })),
    notEnough: t.trends.notEnoughHistory > 0 ? copy.training.notEnough(t.trends.notEnoughHistory) : null,
    showRule: t.trends.trained > 0,
  };
}

function nutritionView(snapshot: WeeklyReviewSnapshot): NutritionView {
  const { review } = snapshot;
  const n = review.nutrition;
  if (n.kind === 'unavailable') {
    return { kind: 'unavailable' };
  }
  const coverage = `Food logged on ${n.loggedDays} of ${plural(n.elapsedDays, 'day', 'days')}${review.current ? ` ${copy.soFar}` : ''}`;
  if (!n.average) {
    return { kind: 'empty', coverage };
  }
  // The dashboard's own comparison, so withheld targets are never shown.
  const summary = toIntakeSummary(n.average, snapshot.targets);
  const protein = summary.macros.find((m) => m.key === 'protein');
  return {
    kind: 'ready',
    coverage,
    rows: [
      { key: 'calories', label: copy.nutrition.calories, value: `${formatKcal(n.average.calories)} kcal ${copy.nutrition.perDay}`, target: summary.calories.target ? copy.nutrition.target(`${summary.calories.target} kcal`) : null },
      { key: 'protein', label: copy.nutrition.protein, value: `${formatGrams(n.average.proteinGrams)} g ${copy.nutrition.perDay}`, target: protein?.target ? copy.nutrition.target(protein.target) : null },
    ],
    targetNote: summary.targetNote,
    link: { label: copy.links.nutritionWeek, target: { kind: 'nutrition-week', date: review.weekStart } },
  };
}

function bodyView(review: WeeklyReview, unitSystem: UnitSystem): BodyView {
  const b = review.body;
  const unit = weightUnitLabel(unitSystem);
  let weight: BodyView['weight'] = { kind: 'unavailable' };
  if (b.weight.kind === 'ready') {
    const trend = b.weight.trend;
    weight =
      trend.kind === 'change'
        ? {
            kind: 'ready',
            text: `${signed(trend.change)} ${unit} over ${WEIGHT_WINDOW_DAYS / 7} weeks`,
            detail: `${oneDecimal.format(weightInUnit(trend.first.weight, unitSystem))} ${unit} on ${shortDate(trend.first.date)} → ${oneDecimal.format(weightInUnit(trend.last.weight, unitSystem))} ${unit} on ${shortDate(trend.last.date)}, ${plural(trend.entries, 'weigh-in', 'weigh-ins')}`,
          }
        : { kind: 'ready', text: copy.body.weightInsufficient(trend.entries), detail: null };
  }
  const length = lengthUnitLabel(unitSystem);
  const measurements: BodyView['measurements'] =
    b.measurements.kind === 'ready'
      ? {
          kind: 'ready',
          items: b.measurements.changes.map((c) => ({
            key: c.site,
            label: MEASUREMENT_COPY.sites[c.site],
            value: `${signed(c.change)} ${length}`,
            detail: `${shortDate(c.previous.date)} → ${shortDate(c.latest.date)}`,
          })),
        }
      : { kind: 'unavailable' };
  const composition: BodyView['composition'] =
    b.composition.kind === 'ready'
      ? {
          kind: 'ready',
          items: b.composition.changes.map((c) => ({
            key: c.metric,
            label: BODY_COMPOSITION_COPY.metrics[c.metric],
            value:
              c.kind === 'change'
                ? `${signed(c.change, Math.max(1, (String(Math.abs(c.change)).split('.')[1] ?? '').length))}${c.unit === '%' ? '%' : c.unit === 'none' ? '' : ` ${c.unit}`}`
                : copy.body.differentUnits,
            detail: `${shortDate(c.previous.date)} → ${shortDate(c.latest.date)}`,
          })),
        }
      : { kind: 'unavailable' };
  return { weight, measurements, composition };
}

// --- Actions --------------------------------------------------------------------------------

function actionView(action: ReviewAction): ActionView {
  switch (action.id) {
    case 'complete-workouts': {
      const remaining = action.planned - action.completed;
      return action.current
        ? {
            id: action.id,
            title: `Fit in your remaining ${plural(remaining, 'workout', 'workouts')}`,
            reason: `${action.completed} of ${action.planned} planned workouts done so far this week.`,
            link: { label: copy.links.workout, target: { kind: 'workout' } },
          }
        : {
            id: action.id,
            title: `Complete your ${plural(action.planned, 'planned workout', 'planned workouts')}`,
            reason: `You finished ${action.completed} of ${action.planned} planned workouts in this week.`,
            link: { label: copy.links.workout, target: { kind: 'workout' } },
          };
    }
    case 'protein':
      return {
        id: action.id,
        title: `Bring protein closer to ${formatGrams(action.target)} g a day`,
        reason: `On the ${action.loggedDays} days you logged, protein averaged ${formatGrams(action.average)} g, below your ${formatGrams(action.target)} g daily target.`,
        link: { label: copy.links.nutrition, target: { kind: 'nutrition' } },
      };
    case 'log-food':
      return {
        id: action.id,
        title: 'Log your food on more days',
        reason: `Food was logged on ${action.loggedDays} of ${plural(action.elapsedDays, 'day', 'days')}, so your averages aren’t reliable yet.`,
        link: { label: copy.links.nutrition, target: { kind: 'nutrition' } },
      };
    case 'review-exercise':
      return {
        id: action.id,
        title: `Review your progression on ${action.trend.exerciseName}`,
        reason: `No better top set than ${topSetText(action.trend, 'reference')} in your last ${STALL_WINDOW} comparable sessions.`,
        link: { label: copy.links.exercise, target: { kind: 'exercise', exerciseId: action.trend.exerciseId } },
      };
    case 'weigh-in':
      return {
        id: action.id,
        title: 'Weigh in at least twice',
        reason: `${action.recentWeighIns === 0 ? 'No weigh-ins' : action.recentWeighIns === 1 ? 'One weigh-in' : `${action.recentWeighIns} weigh-ins`} in the last 2 weeks; two or more show a clearer trend.`,
        link: { label: copy.links.weighIn, target: { kind: 'weigh-in' } },
      };
    case 'measure':
      return {
        id: action.id,
        title: 'Record your body measurements',
        reason: action.lastMeasured ? `Last measured on ${shortDate(action.lastMeasured)}, more than 4 weeks ago.` : 'No tape measurements recorded yet; they help track change beyond the scale.',
        link: { label: copy.links.measure, target: { kind: 'measure' } },
      };
  }
}

// --- Screen ---------------------------------------------------------------------------------

function summaryOf(review: WeeklyReview, unitSystem: UnitSystem): string {
  const parts: string[] = [];
  const t = review.training;
  if (t.kind === 'ready' && (t.completed > 0 || t.planned !== null)) {
    parts.push(t.planned !== null ? `finished ${t.completed} of ${t.planned} planned workouts` : `finished ${plural(t.completed, 'workout', 'workouts')}`);
  }
  const n = review.nutrition;
  if (n.kind === 'ready' && n.loggedDays > 0) {
    parts.push(`logged food on ${n.loggedDays} of ${plural(n.elapsedDays, 'day', 'days')}`);
  }
  const w = review.body.weight;
  if (w.kind === 'ready' && w.trend.kind === 'change') {
    const change = w.trend.change;
    const unit = weightUnitLabel(unitSystem);
    parts.push(change === 0 ? 'your weight was unchanged over 4 weeks' : `your weight was ${oneDecimal.format(Math.abs(change))} ${unit} ${change < 0 ? 'lower' : 'higher'} over 4 weeks`);
  }
  if (parts.length === 0) {
    return 'Not much was recorded in this week, so there’s little to review yet.';
  }
  const sentence = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return review.current ? `So far this week, you ${sentence}.` : `You ${sentence}.`;
}

function statsOf(review: WeeklyReview, unitSystem: UnitSystem): StatView[] {
  const t = review.training;
  const n = review.nutrition;
  const w = review.body.weight;
  return [
    { key: 'workouts', label: copy.overview.workouts, value: t.kind === 'ready' ? (t.planned !== null ? `${t.completed} / ${t.planned}` : String(t.completed)) : copy.overview.noData },
    { key: 'food', label: copy.overview.food, value: n.kind === 'ready' ? `${n.loggedDays} / ${n.elapsedDays} days` : copy.overview.noData },
    {
      key: 'weight',
      label: copy.overview.weight,
      value: w.kind === 'ready' && w.trend.kind === 'change' ? `${signed(w.trend.change)} ${weightUnitLabel(unitSystem)}` : copy.overview.noData,
    },
  ];
}

export function toReviewScreen(snapshot: WeeklyReviewSnapshot): ReviewScreen {
  const { review, today, unitSystem } = snapshot;
  return {
    header: toWeekHeader(review.weekStart, review.weekEnd, today),
    current: review.current,
    summary: summaryOf(review, unitSystem),
    stats: statsOf(review, unitSystem),
    actionsTitle: review.current ? copy.actions.titleCurrent : copy.actions.title,
    actions: review.actions.map(actionView),
    training: trainingView(review),
    nutrition: nutritionView(snapshot),
    body: bodyView(review, unitSystem),
  };
}
