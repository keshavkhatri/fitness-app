import { BodyCompositionHistoryState } from '../../core/body-composition/body-composition-history.service';
import { WeightHistoryState } from '../../core/body-measurements/weight-history.service';
import { STREAK_MILESTONES } from '../../domain/daily-check-in';
import { CalendarDate, IsoCalendarDate, UserFitnessProfile, compareCalendarDates, weightInUnit } from '../../domain/fitness-profile';
import { EXERCISE_LIBRARY, PlanSession, exerciseGuidance } from '../../domain/workout-programming';
import {
  ExercisePerformanceSession,
  WorkoutLog,
  addDays,
  completedWorkouts,
  isBetterSet,
  isTrainingWorkout,
  performedExercises,
  startOfWeek,
  topSet,
  workoutVolume,
} from '../../domain/workout-session';
import { formatChange, formatDisplayWeight } from '../body-weight/weight-history-view-model';
import { WorkoutScreen } from '../workout/workout-view-model';
import { formatPerformedSet, toBodyMetrics } from '../workout/progress/progress-view-model';

/**
 * The dashboard's extra cards, from what the user recorded and planned. Each appears only when it has something
 * true to say (no placeholder cards, no invented numbers). Pure: the page reads the data, this only shapes it.
 */

export type InsightAction =
  | { readonly kind: 'log-weight' }
  | { readonly kind: 'body-composition' }
  | { readonly kind: 'progress-workout' }
  | { readonly kind: 'session'; readonly sessionId: string }
  | { readonly kind: 'streak' }
  | { readonly kind: 'weight-history' };

export type InsightCard =
  | {
      readonly kind: 'goal-weight';
      readonly latest: string;
      readonly target: string;
      /** "3.2 kg to go" */
      readonly remaining: string;
      /** 0–1 of the way from the first weigh-in to the target. */
      readonly progress: number;
      readonly reached: boolean;
      readonly action: InsightAction;
    }
  | { readonly kind: 'streak-milestone'; readonly current: number; readonly next: number; readonly action: InsightAction }
  | { readonly kind: 'personal-bests'; readonly items: readonly { readonly exercise: string; readonly set: string }[]; readonly action: InsightAction }
  | {
      readonly kind: 'body';
      readonly items: readonly { readonly label: string; readonly value: string; readonly change: string | null; readonly direction: 'up' | 'down' | 'same' | null }[];
      readonly since: string | null;
      readonly action: InsightAction;
    }
  | { readonly kind: 'upcoming'; readonly items: readonly { readonly sessionId: string; readonly weekday: string; readonly title: string; readonly detail: string }[] }
  | {
      readonly kind: 'volume';
      /** "12,450 kg" */
      readonly thisWeek: string;
      readonly lastWeek: string | null;
      /** "+8% vs last week" */
      readonly change: string | null;
      readonly direction: 'up' | 'down' | 'same' | null;
      readonly action: InsightAction;
    }
  | { readonly kind: 'weigh-in'; readonly daysSince: number | null; readonly action: InsightAction }
  | { readonly kind: 'tip'; readonly exercise: string; readonly cue: string; readonly breathing: string };

export interface InsightInputs {
  readonly today: CalendarDate;
  readonly todayIso: IsoCalendarDate;
  readonly workouts: readonly WorkoutLog[] | null;
  readonly weights: WeightHistoryState;
  readonly composition: BodyCompositionHistoryState;
  readonly profile: UserFitnessProfile | null;
  readonly screen: WorkoutScreen | null;
  readonly sessions: readonly PlanSession[];
  readonly streak: number | null;
  readonly localDate: (instant: string) => CalendarDate;
}

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const dayNumber = (d: CalendarDate) => Date.UTC(d.year, d.month - 1, d.day) / 86_400_000;
const isoDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

function goalWeightCard(inputs: InsightInputs): InsightCard | null {
  const target = inputs.profile?.goalTarget.targetWeight;
  const s = inputs.weights;
  if (!target || s.status !== 'ready' || s.entries.length === 0) {
    return null;
  }
  const byDate = [...s.entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const unit = s.unitSystem;
  const start = weightInUnit(byDate[0].weight, unit);
  const latest = weightInUnit(byDate[byDate.length - 1].weight, unit);
  const goal = weightInUnit(target, unit);
  const distance = Math.abs(latest - goal);
  const total = Math.abs(start - goal);
  const towards = Math.sign(goal - start) === Math.sign(latest - start) || latest === start;
  const reached = start === goal ? true : start > goal ? latest <= goal : latest >= goal;
  const progress = reached ? 1 : total === 0 || !towards ? 0 : Math.min(1, Math.max(0, Math.abs(latest - start) / total));
  return {
    kind: 'goal-weight',
    latest: formatDisplayWeight(latest, unit),
    target: formatDisplayWeight(goal, unit),
    remaining: reached ? 'Goal reached' : `${formatChange(distance, unit).replace(/^[+−-]/, '')} to go`,
    progress,
    reached,
    action: { kind: 'weight-history' },
  };
}

function streakCard(inputs: InsightInputs): InsightCard | null {
  const current = inputs.streak ?? 0;
  const next = STREAK_MILESTONES.find((m) => m > current);
  return current > 0 && next ? { kind: 'streak-milestone', current, next, action: { kind: 'streak' } } : null;
}

/** A new best top set this week: better than every earlier comparable session of the exercise. */
function personalBestsCard(inputs: InsightInputs): InsightCard | null {
  if (!inputs.workouts) {
    return null;
  }
  const monday = startOfWeek(inputs.today);
  const inWeek = (s: ExercisePerformanceSession) => compareCalendarDates(inputs.localDate(s.completedAt), monday) >= 0;
  const items: { exercise: string; set: string }[] = [];
  for (const performance of performedExercises(completedWorkouts(inputs.workouts).filter(isTrainingWorkout))) {
    const [latest, ...earlier] = performance.sessions;
    if (!latest || !inWeek(latest) || latest.sets.length === 0) {
      continue;
    }
    const comparable = earlier.filter((s) => s.logging === latest.logging && s.weightUnit === latest.weightUnit && s.sets.length > 0);
    const best = topSet(latest);
    if (comparable.length > 0 && comparable.every((s) => isBetterSet(latest.logging, best, topSet(s)))) {
      items.push({ exercise: performance.exerciseName, set: formatPerformedSet(best, latest.logging, latest.weightUnit) });
    }
  }
  return items.length ? { kind: 'personal-bests', items: items.slice(0, 3), action: { kind: 'progress-workout' } } : null;
}

function bodyCard(inputs: InsightInputs): InsightCard | null {
  if (inputs.composition.status !== 'ready' || inputs.composition.assessments.length === 0) {
    return null;
  }
  const [, fat, muscle] = toBodyMetrics(inputs.weights, inputs.composition, inputs.todayIso, 'first');
  const items = [fat, muscle]
    .filter((m) => m.value !== null)
    .map((m) => ({ label: m.label, value: `${m.value}${m.unit === '%' ? '%' : ` ${m.unit}`}`, change: m.change?.text ?? null, direction: m.change?.direction ?? null }));
  if (items.length === 0) {
    return null;
  }
  const since = [fat, muscle].find((m) => m.change)?.caption ?? null;
  return { kind: 'body', items, since, action: { kind: 'body-composition' } };
}

function upcomingCard(inputs: InsightInputs): InsightCard | null {
  const screen = inputs.screen;
  if (!screen || screen.kind !== 'ready') {
    return null;
  }
  const todayIndex = screen.week.findIndex((d) => d.isToday);
  const items = screen.week
    .slice(todayIndex + 1)
    .filter((d) => d.sessionId && (d.session.kind === 'resistance' || d.session.kind === 'activity'))
    .slice(0, 2)
    .map((d) => ({
      sessionId: d.sessionId as string,
      weekday: d.weekday,
      title: d.session.kind === 'rest' ? '' : d.session.title,
      detail: d.session.kind === 'resistance' ? `${d.session.estimatedMinutes} min` : 'Light activity',
    }));
  return items.length ? { kind: 'upcoming', items } : null;
}

function volumeCard(inputs: InsightInputs): InsightCard | null {
  if (!inputs.workouts) {
    return null;
  }
  const monday = startOfWeek(inputs.today);
  const lastMonday = addDays(monday, -7);
  const training = completedWorkouts(inputs.workouts).filter(isTrainingWorkout);
  const unit = training[0]?.weightUnit;
  if (!unit) {
    return null;
  }
  const sum = (from: CalendarDate, to: CalendarDate) =>
    training
      .filter((l) => l.weightUnit === unit)
      .filter((l) => {
        const day = inputs.localDate(l.completedAt as string);
        return compareCalendarDates(day, from) >= 0 && compareCalendarDates(day, to) <= 0;
      })
      .reduce((total, l) => total + (workoutVolume(l) ?? 0), 0);
  const thisWeek = sum(monday, inputs.today);
  const lastWeek = sum(lastMonday, addDays(monday, -1));
  if (thisWeek === 0) {
    return null;
  }
  const change = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;
  return {
    kind: 'volume',
    thisWeek: `${grouped.format(thisWeek)} ${unit}`,
    lastWeek: lastWeek > 0 ? `${grouped.format(lastWeek)} ${unit}` : null,
    change: change === null ? null : `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change)}% vs last week`,
    direction: change === null ? null : change > 0 ? 'up' : change < 0 ? 'down' : 'same',
    action: { kind: 'progress-workout' },
  };
}

function weighInCard(inputs: InsightInputs): InsightCard | null {
  const s = inputs.weights;
  if (s.status !== 'ready' || !inputs.profile) {
    return null;
  }
  const latest = [...s.entries].sort((a, b) => b.date.localeCompare(a.date))[0];
  const daysSince = latest ? Math.round(dayNumber(inputs.today) - isoDay(latest.date)) : null;
  return daysSince === null || daysSince >= 7 ? { kind: 'weigh-in', daysSince, action: { kind: 'log-weight' } } : null;
}

/** One form cue a day, from an exercise of today's (or the next) planned workout. */
function tipCard(inputs: InsightInputs): InsightCard | null {
  const screen = inputs.screen;
  const ids: string[] = [];
  if (screen?.kind === 'ready') {
    const order = [screen.today, ...screen.week.filter((d) => !d.isToday)];
    for (const day of order) {
      const session = inputs.sessions.find((s) => s.id === day.sessionId);
      if (session && session.kind === 'resistance') {
        ids.push(...session.exercises.map((e) => e.exerciseId));
        break;
      }
    }
  }
  const candidates = ids.filter((id) => exerciseGuidance(id));
  if (candidates.length === 0) {
    return null;
  }
  const dayIndex = Math.floor(dayNumber(inputs.today));
  const id = candidates[dayIndex % candidates.length];
  const guidance = exerciseGuidance(id)!;
  const name = EXERCISE_LIBRARY.find((e) => e.id === id)?.name ?? id;
  return { kind: 'tip', exercise: name, cue: guidance.cues[dayIndex % guidance.cues.length], breathing: guidance.breathing };
}

/** The dashboard's extra cards, most useful first. */
export function toHomeInsights(inputs: InsightInputs): readonly InsightCard[] {
  return [
    goalWeightCard(inputs) ?? streakCard(inputs),
    personalBestsCard(inputs),
    upcomingCard(inputs),
    bodyCard(inputs),
    volumeCard(inputs),
    weighInCard(inputs),
    tipCard(inputs),
  ].filter((c): c is InsightCard => c !== null);
}
