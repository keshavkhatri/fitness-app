import { WorkoutLog, summarizeWorkoutLog } from '../../../domain/workout-session';
import { WORKOUT_COPY } from '../workout-content';
import { titleFor } from '../workout-formatting';

/** Presentation model for the minimal Workout Summary (no analytics). */
export interface WorkoutSummaryView {
  readonly heading: string;
  readonly workoutName: string;
  readonly status: string;
  readonly fullyCompleted: boolean;
  readonly facts: readonly { readonly key: string; readonly label: string; readonly value: string }[];
}

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

export function toWorkoutSummaryView(log: WorkoutLog): WorkoutSummaryView {
  const copy = WORKOUT_COPY.summary;
  const s = summarizeWorkoutLog(log);
  const facts: { key: string; label: string; value: string }[] = [
    { key: 'duration', label: copy.duration, value: formatDuration(s.durationSeconds) },
    { key: 'exercises', label: copy.exercises, value: copy.exercisesValue(s.exercisesCompleted, s.totalExercises) },
    { key: 'completed', label: copy.setsCompleted, value: `${s.setsCompleted}` },
    { key: 'skipped', label: copy.setsSkipped, value: `${s.setsSkipped}` },
  ];
  if (s.setsIncomplete > 0) {
    facts.push({ key: 'incomplete', label: copy.setsIncomplete, value: `${s.setsIncomplete}` });
  }
  return {
    heading: s.fullyCompleted ? copy.title : copy.partialTitle,
    workoutName: titleFor(log.sessionType, log.variant),
    status: s.fullyCompleted ? copy.statusComplete : copy.statusPartial,
    fullyCompleted: s.fullyCompleted,
    facts,
  };
}
