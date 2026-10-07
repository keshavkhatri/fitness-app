/**
 * View models for the Home dashboard.
 *
 * These describe what Home needs to render, not the shape of future domain
 * entities (workouts, food logs, measurements). When those domains exist,
 * a mapper will build `HomeSummary` from them.
 */

export interface HomeSummary {
  user: HomeUser;
  goal: GoalSummary;
  /** `null` when nothing is scheduled today. */
  todayWorkout: TodayWorkoutSummary | null;
  nutrition: NutritionDaySummary;
  progress: ProgressSummary;
}

export interface HomeUser {
  firstName: string;
}

export interface GoalSummary {
  title: string;
  description: string;
  currentWeek: number;
  totalWeeks: number;
}

export interface TodayWorkoutSummary {
  name: string;
  focus: string;
  exerciseCount: number;
  estimatedMinutes: number;
}

export type MacroKey = 'protein' | 'carbs' | 'fat';

export interface MacroProgress {
  key: MacroKey;
  label: string;
  consumedGrams: number;
  targetGrams: number;
}

export interface NutritionDaySummary {
  caloriesConsumed: number;
  caloriesTarget: number;
  macros: readonly MacroProgress[];
}

export interface Trend {
  direction: 'up' | 'down' | 'flat';
  /** Whether the change is good for the user's goal. */
  sentiment: 'positive' | 'negative' | 'neutral';
  label: string;
}

export interface ProgressMetricSummary {
  id: string;
  label: string;
  value: string;
  unit?: string;
  trend?: Trend;
}

export interface ProgressSummary {
  workoutsCompletedThisWeek: number;
  workoutsPlannedThisWeek: number;
  metrics: readonly ProgressMetricSummary[];
}
