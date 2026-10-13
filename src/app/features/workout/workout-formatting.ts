import { ActivitySession, Exercise, ExerciseTarget, PlannedExercise, SessionType, WorkoutSession } from '../../domain/workout-programming';
import { ACTIVITY_LABELS, ACTIVITY_TITLES, EQUIPMENT_LABELS, MUSCLE_LABELS, SESSION_TITLES, WORKOUT_COPY } from './workout-content';

/**
 * Text formatting shared by the Workout plan and Workout Detail view models,
 * so a session or prescription reads the same everywhere. Pure functions over
 * plan data; no programming logic.
 */

export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export const formatMinutes = (minutes: number) => `~${minutes} min`;

export const formatMinuteRange = (range: { readonly min: number; readonly max: number }) =>
  range.min === range.max ? `${range.min} min` : `${range.min}–${range.max} min`;

/** "Walking, easy cycling or mobility work." */
export function sentenceList(items: readonly string[]): string {
  if (items.length === 0) {
    return '';
  }
  const text = items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** "Upper Body A" (type + variant letter). Never used to identify a session. */
export const sessionTitle = (session: Pick<WorkoutSession, 'sessionType' | 'variant'>) =>
  titleFor(session.sessionType, session.variant);

export const titleFor = (sessionType: SessionType, variant: string | null) =>
  variant ? `${SESSION_TITLES[sessionType]} ${variant}` : SESSION_TITLES[sessionType];

export const activityTitle = (session: ActivitySession) => ACTIVITY_TITLES[session.sessionType];

/** "Recovery · 20–30 min" / "Optional · 15–20 min" */
export const activitySummary = (session: ActivitySession) =>
  `${session.optional ? WORKOUT_COPY.activity.optionalLabel : WORKOUT_COPY.activity.recoveryLabel} · ${formatMinuteRange(session.durationMinutes)}`;

export const activitySuggestions = (session: ActivitySession) =>
  sentenceList(session.suggestedActivities.map((kind) => ACTIVITY_LABELS[kind]));

export const activityGuidance = (session: ActivitySession) =>
  session.optional ? WORKOUT_COPY.activity.optional : WORKOUT_COPY.activity.pace;

/** The parts of a prescription the formatters need (a planned exercise or a log's snapshot of one). */
export interface PrescriptionLike {
  readonly sets: number;
  readonly target: ExerciseTarget;
  readonly restSeconds: number;
  readonly perSide: boolean;
}

export const prescriptionOf = (exercise: PlannedExercise): PrescriptionLike => ({
  sets: exercise.sets,
  target: exercise.target,
  restSeconds: exercise.restSeconds,
  perSide: exercise.notes.includes('per-side'),
});

/** "8–12", "10" or "30 sec" (the work target without its unit word for reps). */
export function targetValue(exercise: PrescriptionLike): string {
  const t = exercise.target;
  if (t.kind === 'time') {
    return `${t.seconds} sec`;
  }
  return t.min === t.max ? `${t.min}` : `${t.min}–${t.max}`;
}

/** "120 sec"; null when there is no rest (never "0 sec"). */
export const formatRest = (seconds: number): string | null => (seconds > 0 ? `${seconds} sec` : null);

/**
 * A prescription as parts that must not break across lines:
 * ["4 sets", "6–10 reps", "120 sec rest"], ["3 sets", "8–12 reps per side", …], ["3 sets", "30 sec"].
 */
export function prescriptionParts(planned: PlannedExercise | PrescriptionLike): string[] {
  const exercise = 'notes' in planned ? prescriptionOf(planned) : planned;
  const perSide = exercise.perSide ? ' per side' : '';
  const target = exercise.target.kind === 'time' ? targetValue(exercise) : `${targetValue(exercise)} reps`;
  const parts = [plural(exercise.sets, 'set', 'sets'), `${target}${perSide}`];
  const rest = formatRest(exercise.restSeconds);
  if (rest) {
    parts.push(`${rest} rest`);
  }
  return parts;
}

export const formatPrescription = (exercise: PlannedExercise | PrescriptionLike) => prescriptionParts(exercise).join(' · ');

export interface PrescriptionStat {
  readonly value: string;
  /** Visible label, e.g. "reps / side". */
  readonly label: string;
  /** Spoken label, e.g. "reps per side". */
  readonly spokenLabel: string;
}

/** The prescription as short stats for a compact grid: sets, reps or time, rest (when there is rest). */
export function prescriptionStats(planned: PlannedExercise | PrescriptionLike): PrescriptionStat[] {
  const exercise = 'notes' in planned ? prescriptionOf(planned) : planned;
  const side = exercise.perSide;
  const unit = exercise.target.kind === 'time' ? 'time' : exercise.target.min === 1 && exercise.target.max === 1 ? 'rep' : 'reps';
  const stats: PrescriptionStat[] = [
    { value: `${exercise.sets}`, label: exercise.sets === 1 ? 'set' : 'sets', spokenLabel: exercise.sets === 1 ? 'set' : 'sets' },
    {
      value: targetValue(exercise),
      label: side ? `${unit} / side` : unit,
      spokenLabel: side ? `${unit} per side` : unit,
    },
  ];
  const rest = formatRest(exercise.restSeconds);
  if (rest) {
    stats.push({ value: rest, label: 'rest', spokenLabel: 'rest' });
  }
  return stats;
}

/** Primary muscles from the catalog, e.g. ["Chest", "Triceps"]; empty when unknown. */
export const exerciseMuscles = (exercise: Exercise | undefined): string[] => exercise?.primaryMuscles.map((m) => MUSCLE_LABELS[m]) ?? [];

/** "Barbell, bench, rack" or "Bodyweight"; null when the exercise isn't in the catalog. */
export function exerciseEquipment(exercise: Exercise | undefined): string | null {
  if (!exercise) {
    return null;
  }
  return exercise.requires.length === 0
    ? WORKOUT_COPY.detail.bodyweight
    : exercise.requires.map((e, i) => (i === 0 ? EQUIPMENT_LABELS[e] : EQUIPMENT_LABELS[e].toLowerCase())).join(', ');
}

/** "Chest · Barbell, bench, rack" (primary muscles and equipment from the catalog); null when unknown. */
export function exerciseMetadata(exercise: Exercise | undefined): string | null {
  if (!exercise) {
    return null;
  }
  return [exerciseMuscles(exercise).join(' · '), exerciseEquipment(exercise)].filter(Boolean).join(' · ') || null;
}
