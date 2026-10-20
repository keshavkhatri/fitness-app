import { CustomPlanIssue, validateCustomPlan } from '../../../domain/training-plan';
import { Exercise, WorkoutPlan, WorkoutSession } from '../../../domain/workout-programming';
import { MUSCLE_AREAS } from '../workout-content';
import { exerciseMetadata, sessionTitle } from '../workout-formatting';
import { CUSTOM_PLAN_COPY } from './custom-plan-content';
import { ExerciseFieldErrors, PlanDraft, PrescriptionField, exerciseErrors, toSpec } from './custom-plan-draft';

const COPY = CUSTOM_PLAN_COPY;

export interface EditorExerciseView {
  readonly exerciseId: string;
  readonly order: number;
  readonly name: string;
  readonly metadata: string | null;
  readonly timed: boolean;
  /** "3 sets · 8–12 reps · 90 sec rest" (as typed; blank where a field is empty). */
  readonly summary: string;
  readonly errors: ExerciseFieldErrors;
  readonly first: boolean;
  readonly last: boolean;
}

export interface EditorDayView {
  readonly sessionId: string;
  readonly heading: string;
  /** Broad areas its exercises train, in order: "Chest, Back, Shoulders" ("" when empty). */
  readonly areas: string;
  readonly countLabel: string;
  readonly exercises: readonly EditorExerciseView[];
  /** Set when the day cannot be saved as it is (e.g. empty). */
  readonly problem: string | null;
}

export interface EditorView {
  readonly days: readonly EditorDayView[];
  /** Every reason the plan cannot be saved yet, one line each, for the review. */
  readonly problems: readonly string[];
  readonly canSave: boolean;
  readonly exerciseCount: number;
  readonly setCount: number;
}

const FIELD_LABEL: Record<PrescriptionField, string> = {
  sets: COPY.editor.sets,
  repsMin: COPY.editor.repsMin,
  repsMax: COPY.editor.repsMax,
  seconds: COPY.editor.seconds,
  rest: COPY.editor.rest,
};

/** "4 sets · 6–10 reps · 120 sec rest" (or seconds of work for a timed exercise), as the editor writes it. */
export function summarize(exercise: PlanDraft[number]['exercises'][number], timed: boolean): string {
  const sets = `${exercise.sets || '–'} ${exercise.sets === '1' ? 'set' : 'sets'}`;
  const work = timed
    ? `${exercise.seconds || '–'} ${COPY.editor.unitSeconds}`
    : `${exercise.repsMin || '–'}${exercise.repsMax && exercise.repsMax !== exercise.repsMin ? `–${exercise.repsMax}` : ''} reps`;
  const rest = exercise.rest === '0' ? null : `${exercise.rest || '–'} ${COPY.editor.unitSeconds} rest`;
  return [sets, work, rest].filter(Boolean).join(' · ');
}

/** The draft as the editor shows it, with every problem found (typed fields first, then plan rules). */
export function toEditorView(plan: WorkoutPlan, draft: PlanDraft, catalog: ReadonlyMap<string, Exercise>): EditorView {
  const sessions = new Map(plan.sessions.filter((s): s is WorkoutSession => s.kind === 'resistance').map((s) => [s.id, s]));
  const spec = toSpec(draft, catalog);
  const rules = spec ? validateCustomPlan(plan, spec, catalog) : [];
  const dayIssue = (sessionId: string): CustomPlanIssue | undefined => rules.find((i) => i.sessionId === sessionId && i.index === null);

  const problems: string[] = [];
  let exerciseCount = 0;
  let setCount = 0;

  const days = draft.map((day): EditorDayView => {
    const session = sessions.get(day.sessionId);
    const heading = COPY.editor.day(session?.dayIndex ?? 0, session ? sessionTitle(session) : day.sessionId);
    const issue = dayIssue(day.sessionId);
    const problem = issue ? COPY.issues[issue.code] : null;
    if (problem) {
      problems.push(`${heading}: ${problem}`);
    }
    const exercises = day.exercises.map((e, index): EditorExerciseView => {
      const exercise = catalog.get(e.exerciseId);
      const timed = exercise?.measurement === 'time';
      const errors = exerciseErrors(e, timed);
      for (const field of Object.keys(errors) as PrescriptionField[]) {
        problems.push(`${heading}, ${exercise?.name ?? e.exerciseId}: ${FIELD_LABEL[field]}. ${errors[field]}`);
      }
      exerciseCount += 1;
      setCount += Number.isInteger(Number(e.sets)) ? Number(e.sets) : 0;
      return {
        exerciseId: e.exerciseId,
        order: index + 1,
        name: exercise?.name ?? e.exerciseId,
        metadata: exerciseMetadata(exercise),
        timed,
        summary: summarize(e, timed),
        errors,
        first: index === 0,
        last: index === day.exercises.length - 1,
      };
    });
    const areas = [...new Set(day.exercises.flatMap((e) => catalog.get(e.exerciseId)?.primaryMuscles.map((m) => MUSCLE_AREAS[m]) ?? []))]
      .slice(0, 3)
      .join(', ');
    return { sessionId: day.sessionId, heading, areas, countLabel: COPY.editor.count(exercises.length), exercises, problem };
  });

  // Rules for other issue kinds (e.g. unknown exercise) that have no day-level line yet.
  for (const issue of rules.filter((i) => i.index !== null || (!sessions.has(i.sessionId) && i.code !== 'empty-day'))) {
    problems.push(COPY.issues[issue.code]);
  }
  return { days, problems, canSave: problems.length === 0, exerciseCount, setCount };
}
