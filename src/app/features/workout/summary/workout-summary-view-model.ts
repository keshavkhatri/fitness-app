import {
  ExerciseLog,
  ExercisePerformanceSession,
  WorkoutLog,
  completedWorkouts,
  estimateWorkoutCalories,
  isTrainingWorkout,
  sessionVolume,
  summarizeWorkoutLog,
  workoutVolume,
} from '../../../domain/workout-session';
import { MUSCLE_AREAS, WORKOUT_COPY } from '../workout-content';
import { plural, titleFor } from '../workout-formatting';
import { WORKOUT_COMPLETE_PHOTO } from '../workout-photos';
import { CATALOG } from '../workout-view-model';

/**
 * Presentation model for the Workout Summary: one finished workout, as
 * recorded, and how it compares with earlier workouts of the same kind.
 * Pure: everything comes from the log and the history passed in, through the
 * domain's own counts (summarizeWorkoutLog) and volume (workoutVolume /
 * sessionVolume). The one estimate is calories (estimateWorkoutCalories, from the
 * body weight passed in), labelled "Est."; no records beyond what the compared
 * logs show.
 */

/** "Under 1 min", "42 min", "1 h 5 min" */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) {
    return 'Under 1 min';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const rest = minutes % 60;
  return rest === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const formatNumber = (value: number) => numberFormat.format(value);
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const shortDateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

export interface SummaryStat {
  readonly key: 'duration' | 'exercises' | 'sets' | 'volume' | 'calories' | 'completion';
  readonly icon: string;
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
}

export interface WorkoutOverviewView {
  readonly fullyCompleted: boolean;
  readonly heading: string;
  readonly message: string;
  readonly workoutName: string;
  /** Broad body areas the logged exercises train, at most three: "Chest, Back, Shoulders" ("" when unknown). */
  readonly areas: string;
  /** The card's photo. */
  readonly photo: string;
  /** "8 Oct 2026 · 7:05 AM" (when it was finished). */
  readonly finishedAt: string;
  readonly stats: readonly SummaryStat[];
  /** Only claims what the log shows (every set done, or what was left). */
  readonly highlight: { readonly tone: 'success' | 'info'; readonly title: string; readonly text: string };
}

export type ExerciseStatus = 'complete' | 'partial' | 'skipped';

export interface SummaryExerciseView {
  readonly key: string;
  readonly exerciseId: string;
  readonly name: string;
  readonly status: ExerciseStatus;
  /** "Completed", "2 of 3 sets done", "Skipped". */
  readonly statusLabel: string;
  /** "3 of 3 sets" */
  readonly setsLabel: string;
  /** What was performed, set by set: "8, 10, 12 reps", "45 s, 60 s"; null when nothing was. */
  readonly performed: string | null;
  /** Loads used: "60 kg", "60–65 kg"; null without logged weights. */
  readonly load: string | null;
  /** "1,800 kg volume"; null unless weight and reps were logged. */
  readonly volume: string | null;
  /** Only exercises with completed sets have a performance history to open. */
  readonly canOpen: boolean;
}

export interface InsightMetric {
  readonly key: 'volume' | 'sets' | 'duration' | 'calories';
  readonly icon: string;
  readonly label: string;
  readonly value: string;
  /** "↑ 12% vs last time", "Same as last time"; null without a comparable previous workout. */
  readonly change: { readonly direction: 'up' | 'down' | 'same'; readonly text: string; readonly spoken: string } | null;
}

export interface TrendBar {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** 0–1 of the tallest bar. */
  readonly height: number;
  readonly current: boolean;
}

export interface InsightsView {
  /** "Upper Body A" — the kind of workout compared. */
  readonly comparedWith: string;
  /** How many earlier workouts of the same kind there are (any count, for the copy). */
  readonly previousCount: number;
  readonly metrics: readonly InsightMetric[];
  /** Total volume of the latest same-kind workouts (oldest first), when at least two have one in this unit. */
  readonly trend: { readonly unit: string; readonly bars: readonly TrendBar[]; readonly spoken: string } | null;
  /** Highest volume of all same-kind workouts recorded, when there is an earlier one to beat. */
  readonly best: { readonly title: string; readonly text: string } | null;
}

export interface WorkoutSummaryScreen {
  readonly workoutId: string;
  readonly overview: WorkoutOverviewView;
  readonly exercises: readonly SummaryExerciseView[];
  /** null when history couldn't be read. */
  readonly insights: InsightsView | null;
}

/** How many same-kind workouts the volume trend shows (including this one). */
export const TREND_WORKOUTS = 5;

export function toWorkoutSummaryScreen(
  log: WorkoutLog,
  history: readonly WorkoutLog[] | null,
  bodyWeightKg: number | null = null,
): WorkoutSummaryScreen {
  return {
    workoutId: log.id,
    overview: toOverview(log, bodyWeightKg),
    exercises: log.exercises.map((exercise, index) => toExercise(exercise, index, log.weightUnit)),
    insights: history === null ? null : toInsights(log, history, bodyWeightKg),
  };
}

// --- Overview ---------------------------------------------------------------------------------

function toOverview(log: WorkoutLog, bodyWeightKg: number | null): WorkoutOverviewView {
  const copy = WORKOUT_COPY.summary;
  const s = summarizeWorkoutLog(log);
  const name = titleFor(log.sessionType, log.variant);
  const volume = workoutVolume(log);
  const finished = new Date(log.completedAt ?? log.startedAt);

  const stats: SummaryStat[] = [
    { key: 'duration', icon: 'timer-outline', label: copy.duration, value: formatDuration(s.durationSeconds) },
    { key: 'exercises', icon: 'barbell-outline', label: copy.exercises, value: copy.exercisesValue(s.exercisesCompleted, s.totalExercises) },
    { key: 'sets', icon: 'layers-outline', label: copy.sets, value: copy.exercisesValue(s.setsCompleted, s.totalSets) },
  ];
  if (volume !== null) {
    stats.push({ key: 'volume', icon: 'stats-chart', label: copy.volume, value: formatNumber(volume), unit: log.weightUnit });
  }
  const calories = estimateWorkoutCalories(log, bodyWeightKg);
  if (calories !== null) {
    stats.push({ key: 'calories', icon: 'flame-outline', label: copy.calories, value: formatNumber(calories) });
  }
  if (s.totalSets > 0) {
    stats.push({ key: 'completion', icon: 'trophy-outline', label: copy.completion, value: `${Math.round((s.setsCompleted / s.totalSets) * 100)}%` });
  }

  const left = s.setsSkipped + s.setsIncomplete;
  return {
    fullyCompleted: s.fullyCompleted,
    heading: s.fullyCompleted ? copy.completeHeading : copy.partialHeading,
    message: s.fullyCompleted ? copy.completeMessage(name) : copy.partialMessage(name),
    workoutName: name,
    areas: [...new Set(log.exercises.flatMap((e) => CATALOG.get(e.exerciseId)?.primaryMuscles.map((m) => MUSCLE_AREAS[m]) ?? []))].slice(0, 3).join(', '),
    photo: WORKOUT_COMPLETE_PHOTO,
    finishedAt: `${dateFormat.format(finished)} · ${timeFormat.format(finished)}`,
    stats,
    highlight: s.fullyCompleted
      ? { tone: 'success', title: copy.allDone.title, text: copy.allDone.text }
      : {
          tone: 'info',
          title: copy.partly.title,
          text: copy.partly.text(plural(s.setsCompleted, 'set', 'sets'), plural(left, 'set', 'sets')),
        },
  };
}

// --- Exercises --------------------------------------------------------------------------------

/** "60 kg", or "60–65 kg" when the load changed between sets. */
function loadRange(weights: readonly number[], unit: string): string | null {
  if (weights.length === 0) {
    return null;
  }
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  return min === max ? `${formatNumber(min)} ${unit}` : `${formatNumber(min)}–${formatNumber(max)} ${unit}`;
}

function toExercise(exercise: ExerciseLog, index: number, unit: WorkoutLog['weightUnit']): SummaryExerciseView {
  const copy = WORKOUT_COPY.summary.breakdown;
  const done = exercise.sets.filter((s) => s.status === 'completed');
  const total = exercise.sets.length;
  const status: ExerciseStatus = done.length === 0 ? 'skipped' : done.length === total ? 'complete' : 'partial';

  let performed: string | null = null;
  if (exercise.logging === 'duration') {
    const times = done.map((s) => s.durationSeconds).filter((v): v is number => v !== null);
    performed = times.length ? `${times.map((t) => `${t} s`).join(', ')}` : null;
  } else {
    const reps = done.map((s) => s.reps).filter((v): v is number => v !== null);
    performed = reps.length ? `${reps.join(', ')} ${reps.length === 1 && reps[0] === 1 ? 'rep' : 'reps'}` : null;
  }
  const weights = exercise.logging === 'weight-reps' ? done.map((s) => s.weight).filter((v): v is number => v !== null) : [];

  // The domain's own per-exercise volume (completed weighted sets only).
  const session: ExercisePerformanceSession = {
    workoutId: '',
    completedAt: '',
    logging: exercise.logging,
    weightUnit: unit,
    sets: done.map((s) => ({ setNumber: s.setNumber, weight: s.weight, reps: s.reps, durationSeconds: s.durationSeconds, completedAt: s.completedAt ?? '' })),
  };
  const volume = sessionVolume(session);

  return {
    key: `${index}-${exercise.exerciseId}`,
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    status,
    statusLabel: status === 'complete' ? copy.complete : status === 'skipped' ? copy.skipped : copy.partial(done.length, total),
    setsLabel: copy.sets(done.length, total),
    performed,
    load: loadRange(weights, unit),
    volume: volume === null ? null : `${formatNumber(volume)} ${unit} ${copy.volume}`,
    canOpen: done.length > 0,
  };
}

// --- Insights ---------------------------------------------------------------------------------

/** Earlier finished training workouts of the same kind (same session type and variant), most recent first. */
export function comparableWorkouts(log: WorkoutLog, history: readonly WorkoutLog[]): WorkoutLog[] {
  const finishedAt = Date.parse(log.completedAt ?? log.startedAt);
  return completedWorkouts(history).filter(
    (other) =>
      other.id !== log.id &&
      isTrainingWorkout(other) &&
      other.sessionType === log.sessionType &&
      other.variant === log.variant &&
      Date.parse(other.completedAt as string) < finishedAt,
  );
}

function change(current: number, previous: number, format: (n: number) => string, unitWord: string): InsightMetric['change'] {
  const copy = WORKOUT_COPY.summary.insights;
  if (current === previous) {
    return { direction: 'same', text: copy.same, spoken: copy.same };
  }
  const direction = current > previous ? 'up' : 'down';
  const diff = Math.abs(current - previous);
  // A percentage only makes sense against a non-zero previous value.
  const amount = previous > 0 ? `${Math.round((diff / previous) * 100)}%` : `${format(diff)}${unitWord}`;
  return {
    direction,
    text: `${amount} ${copy.vsLast}`,
    spoken: `${direction === 'up' ? 'up' : 'down'} ${amount} ${copy.vsLast}`,
  };
}

function toInsights(log: WorkoutLog, history: readonly WorkoutLog[], bodyWeightKg: number | null): InsightsView {
  const copy = WORKOUT_COPY.summary.insights;
  const earlier = comparableWorkouts(log, history);
  const previous = earlier[0] ?? null;
  const s = summarizeWorkoutLog(log);
  const volume = workoutVolume(log);

  const metrics: InsightMetric[] = [];
  if (volume !== null) {
    // Volume is only compared within one weight unit.
    const before = previous && previous.weightUnit === log.weightUnit ? workoutVolume(previous) : null;
    metrics.push({
      key: 'volume',
      icon: 'stats-chart',
      label: copy.volume,
      value: `${formatNumber(volume)} ${log.weightUnit}`,
      change: before === null ? null : change(volume, before, formatNumber, ` ${log.weightUnit}`),
    });
  }
  const previousSummary = previous ? summarizeWorkoutLog(previous) : null;
  metrics.push({
    key: 'sets',
    icon: 'layers-outline',
    label: copy.sets,
    value: `${s.setsCompleted}`,
    change: previousSummary ? change(s.setsCompleted, previousSummary.setsCompleted, String, '') : null,
  });
  metrics.push({
    key: 'duration',
    icon: 'timer-outline',
    label: copy.duration,
    value: formatDuration(s.durationSeconds),
    change: previousSummary
      ? change(Math.round(s.durationSeconds / 60), Math.round(previousSummary.durationSeconds / 60), String, ' min')
      : null,
  });

  const calories = estimateWorkoutCalories(log, bodyWeightKg);
  if (calories !== null) {
    // Same body weight for both, so the change follows the duration.
    const before = previous ? estimateWorkoutCalories(previous, bodyWeightKg) : null;
    metrics.push({
      key: 'calories',
      icon: 'flame-outline',
      label: copy.calories,
      value: `${formatNumber(calories)} kcal`,
      change: before === null ? null : change(calories, before, formatNumber, ' kcal'),
    });
  }

  // Trend: this and the latest earlier same-kind workouts with a volume in this unit.
  const withVolume = [log, ...earlier]
    .filter((w) => w.weightUnit === log.weightUnit)
    .map((w) => ({ log: w, volume: workoutVolume(w) }))
    .filter((w): w is { log: WorkoutLog; volume: number } => w.volume !== null);
  const recent = withVolume.slice(0, TREND_WORKOUTS).reverse();
  const tallest = Math.max(0, ...recent.map((w) => w.volume));
  const trend =
    volume !== null && recent.length >= 2 && tallest > 0
      ? {
          unit: log.weightUnit,
          bars: recent.map((w) => ({
            key: w.log.id,
            label: shortDateFormat.format(new Date(w.log.completedAt ?? w.log.startedAt)),
            value: compact(w.volume),
            height: w.volume / tallest,
            current: w.log.id === log.id,
          })),
          spoken: recent.map((w) => `${shortDateFormat.format(new Date(w.log.completedAt ?? w.log.startedAt))}: ${formatNumber(w.volume)} ${log.weightUnit}`).join(', '),
        }
      : null;

  // A record only against every earlier same-kind workout with a volume in this unit, and only if strictly higher.
  const earlierVolumes = withVolume.filter((w) => w.log.id !== log.id).map((w) => w.volume);
  const best =
    volume !== null && earlierVolumes.length > 0 && volume > Math.max(...earlierVolumes)
      ? { title: copy.best.title, text: copy.best.text(titleFor(log.sessionType, log.variant), earlierVolumes.length + 1) }
      : null;

  return {
    comparedWith: titleFor(log.sessionType, log.variant),
    previousCount: earlier.length,
    metrics,
    trend,
    best,
  };
}

/** "12.5K", "980" */
function compact(value: number): string {
  return value >= 1000 ? `${formatNumber(Math.round(value / 100) / 10)}K` : formatNumber(Math.round(value));
}
