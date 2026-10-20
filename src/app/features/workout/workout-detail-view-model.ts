import { WorkoutPlanState } from '../../core/workout/workout-plan.service';
import { ActivitySession, Exercise, PlannedExercise, WorkoutPlan, WorkoutSession } from '../../domain/workout-programming';
import { MUSCLE_AREAS, STYLE_DESCRIPTORS, WEEKDAYS, WORKOUT_COPY } from './workout-content';
import {
  PrescriptionStat,
  activityGuidance,
  activitySuggestions,
  activityTitle,
  exerciseMetadata,
  formatMinuteRange,
  formatPrescription,
  plural,
  prescriptionOf,
  prescriptionStats,
  sessionTitle,
} from './workout-formatting';
import { exercisePhoto, sessionPhoto } from './workout-photos';
import { CATALOG, scheduleWeek, weekdayIndexOf } from './workout-view-model';

/**
 * Presentation model for Workout Detail: one session of the current plan,
 * found by its plan id (never by display name). Built by a pure adapter.
 */
export type WorkoutDetailScreen =
  | { readonly kind: 'ready'; readonly detail: SessionDetailView }
  /** No session with this id in the current plan (stale link, changed plan, invalid id, no plan). */
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unavailable' };

export type SessionDetailView = ResistanceDetailView | ActivityDetailView | RestDetailView;

interface DetailHeader {
  /** e.g. "Thursday · Today" */
  readonly dayLabel: string;
  readonly title: string;
  /** The hero photo, or null (drawn art). */
  readonly photo: string | null;
}

export interface ResistanceDetailView extends DetailHeader {
  readonly kind: 'resistance';
  readonly descriptor: string;
  /** "Build upper body strength with …" */
  readonly summary: string;
  readonly countLabel: string;
  readonly durationLabel: string;
  /** Broad body areas in session order, e.g. "Chest · Back · Shoulders · Arms"; null when unknown. */
  readonly focus: string | null;
  /** The same areas, for chips. */
  readonly focusAreas: readonly string[];
  /** The plan's estimate, in minutes. */
  readonly minutes: number;
  readonly exercises: readonly DetailExerciseView[];
  /** Progression guidance phrased from the plan's own progression rules. */
  readonly progression: readonly string[];
  readonly cta: CtaView;
}

export interface DetailExerciseView {
  readonly order: number;
  readonly exerciseId: string;
  readonly name: string;
  /** Thumbnail photo, or null (drawn art). */
  readonly photo: string | null;
  readonly stats: readonly PrescriptionStat[];
  /** Full sentence form, e.g. "4 sets · 6–10 reps · 120 sec rest". */
  readonly prescription: string;
  /** Sets and target only, for the row: "4 sets · 6–10 reps". */
  readonly brief: string;
  /** Primary muscles and equipment, e.g. "Chest · Barbell, bench, rack". */
  readonly metadata: string | null;
  readonly substitution: { readonly title: string; readonly message: string } | null;
}

export interface ActivityDetailView extends DetailHeader {
  readonly kind: 'activity';
  /** "Recovery" or "Optional" */
  readonly typeLabel: string;
  /** "20–30 min" */
  readonly durationLabel: string;
  /** "Easy pace" */
  readonly intensityLabel: string;
  readonly suggestions: string;
  readonly guidance: string;
  readonly cta: CtaView;
}

export interface RestDetailView extends DetailHeader {
  readonly kind: 'rest';
  readonly message: string;
}

export interface CtaView {
  readonly label: string;
  /** For sessions that can't be tracked yet (activities): shown when pressed; nothing is started. */
  readonly pendingMessage: string | null;
}

const REST_ID = /^rest-(mon|tue|wed|thu|fri|sat|sun)$/;

/** Route id for a rest weekday (defensive only: rest days are not linked). */
export const restSessionId = (key: (typeof WEEKDAYS)[number]['key']) => `rest-${key}`;

export function toWorkoutDetailScreen(
  state: WorkoutPlanState,
  sessionId: string,
  today: Date,
  catalog: ReadonlyMap<string, Exercise> = CATALOG,
): WorkoutDetailScreen {
  if (state.kind === 'unavailable') {
    return { kind: 'unavailable' };
  }
  if (state.kind !== 'ready') {
    return { kind: 'not-found' };
  }
  const week = scheduleWeek(state.plan);
  const todayIndex = weekdayIndexOf(today);
  const dayLabel = (index: number) => `${WEEKDAYS[index].name}${index === todayIndex ? ` · ${WORKOUT_COPY.detail.today}` : ''}`;

  const rest = REST_ID.exec(sessionId);
  if (rest) {
    const index = WEEKDAYS.findIndex((d) => d.key === rest[1]);
    return week[index] === null
      ? {
          kind: 'ready',
          detail: { kind: 'rest', dayLabel: dayLabel(index), photo: null, title: WORKOUT_COPY.today.restTitle, message: WORKOUT_COPY.detail.restMessage },
        }
      : { kind: 'not-found' };
  }

  // Lookup by the plan's session id, never by display name.
  const index = week.findIndex((session) => session?.id === sessionId);
  const session = week[index];
  if (!session) {
    return { kind: 'not-found' };
  }
  return {
    kind: 'ready',
    detail:
      session.kind === 'resistance'
        ? toResistanceDetail(session, state.plan, dayLabel(index), catalog)
        : toActivityDetail(session, dayLabel(index)),
  };
}

function toResistanceDetail(
  session: WorkoutSession,
  plan: WorkoutPlan,
  dayLabel: string,
  catalog: ReadonlyMap<string, Exercise>,
): ResistanceDetailView {
  const focus = sessionFocusAreas(session, catalog);
  return {
    kind: 'resistance',
    dayLabel,
    title: sessionTitle(session),
    photo: sessionPhoto(session),
    descriptor: STYLE_DESCRIPTORS[plan.programStyle],
    summary: WORKOUT_COPY.detail.sessionSummary[session.sessionType],
    countLabel: plural(session.exercises.length, 'exercise', 'exercises'),
    durationLabel: `About ${session.estimatedDurationMinutes} min`,
    focus: focus.length > 0 ? focus.join(' · ') : null,
    focusAreas: focus,
    minutes: session.estimatedDurationMinutes,
    exercises: session.exercises.map((planned) => toDetailExercise(planned, catalog)),
    progression: progressionGuidance(session.exercises, catalog),
    cta: { label: WORKOUT_COPY.detail.startWorkout, pendingMessage: null },
  };
}

/** Broad body areas a session trains, in exercise order, without repeats ("Chest", "Back", …). */
export function sessionFocusAreas(session: WorkoutSession, catalog: ReadonlyMap<string, Exercise> = CATALOG): string[] {
  const areas = session.exercises.flatMap((p) => catalog.get(p.exerciseId)?.primaryMuscles.map((m) => MUSCLE_AREAS[m]) ?? []);
  return [...new Set(areas)];
}

function toDetailExercise(planned: PlannedExercise, catalog: ReadonlyMap<string, Exercise>): DetailExerciseView {
  const exercise = catalog.get(planned.exerciseId);
  return {
    order: planned.order,
    exerciseId: planned.exerciseId,
    name: exercise?.name ?? planned.exerciseId,
    photo: exercisePhoto(planned.exerciseId),
    stats: prescriptionStats(planned),
    prescription: formatPrescription(planned),
    brief: formatPrescription({ ...prescriptionOf(planned), restSeconds: 0 }),
    metadata: exerciseMetadata(exercise),
    substitution: planned.selection.substitute ? WORKOUT_COPY.detail.substitution : null,
  };
}

/**
 * One line per rule the plan actually contains: loaded exercises share a
 * double-progression rule (one line per distinct load step); bodyweight and
 * timed exercises get their own line, naming the next chain step if the plan
 * provides one. Nothing is recomputed: thresholds come from the rules.
 */
function progressionGuidance(exercises: readonly PlannedExercise[], catalog: ReadonlyMap<string, Exercise>): string[] {
  const copy = WORKOUT_COPY.detail.progression;
  const name = (id: string) => catalog.get(id)?.name ?? id;
  const loadSteps = new Set<number>();
  const lines: string[] = [];
  for (const planned of exercises) {
    const rule = planned.progression;
    switch (rule.type) {
      case 'double-progression':
        loadSteps.add(rule.loadIncreasePercent);
        break;
      case 'rep-progression': {
        const next = rule.chain?.progression;
        lines.push(copy.reps(name(planned.exerciseId), rule.upperRepBound, next ? name(next) : null));
        break;
      }
      case 'time-progression': {
        const next = rule.chain?.progression;
        lines.push(copy.time(name(planned.exerciseId), rule.incrementSeconds, rule.maxSeconds, next ? name(next) : null));
        break;
      }
    }
  }
  return [...[...loadSteps].map((percent) => copy.loaded(percent)), ...lines];
}

function toActivityDetail(session: ActivitySession, dayLabel: string): ActivityDetailView {
  return {
    kind: 'activity',
    dayLabel,
    title: activityTitle(session),
    photo: sessionPhoto(session),
    typeLabel: session.optional ? WORKOUT_COPY.activity.optionalLabel : WORKOUT_COPY.activity.recoveryLabel,
    durationLabel: formatMinuteRange(session.durationMinutes),
    intensityLabel: WORKOUT_COPY.detail.easyPace,
    suggestions: activitySuggestions(session),
    guidance: activityGuidance(session),
    cta: { label: WORKOUT_COPY.detail.startActivity, pendingMessage: WORKOUT_COPY.detail.activityPending },
  };
}
