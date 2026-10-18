import { Plan } from './entitlement.service';

/**
 * The Free / Premium feature matrix: the one place that says who may use what (docs/access-model.md).
 * Screens ask `canAccess(feature, plan)`; they never compare plans themselves.
 *
 * Everything that existed before Premium stays Free: nothing that worked was taken away. The one built
 * Premium feature is the custom workout plan; until billing is integrated nobody is Premium, so nobody
 * can use it. The other Premium rows are candidates that are not built yet (`available: false`).
 * When the final matrix is decided, change a row's `tier` here (and enforce it on the server for any
 * server-backed feature: a client check alone is not authorization).
 */
export type FeatureId =
  // Built, Free.
  | 'workout-plan'
  | 'exercise-library'
  | 'workout-logging'
  | 'workout-history'
  | 'exercise-progress'
  | 'nutrition-log'
  | 'calorie-check-in'
  | 'weight-tracking'
  | 'body-measurements'
  | 'body-composition'
  | 'inbody-report-import'
  | 'weekly-review'
  | 'reminders'
  | 'account'
  // Built, Premium. Billing isn't integrated, so nobody is Premium yet (docs/access-model.md).
  | 'custom-workout-plan'
  // Not built: Premium candidates.
  | 'cloud-backup'
  | 'progress-photos'
  | 'health-app-sync';

export interface FeatureRule {
  readonly id: FeatureId;
  /** How the offer screen names it. */
  readonly label: string;
  readonly tier: Plan;
  /** Built and usable in this version. */
  readonly available: boolean;
}

export const FEATURE_MATRIX: readonly FeatureRule[] = [
  { id: 'workout-plan', label: 'Personal workout plan', tier: 'free', available: true },
  { id: 'exercise-library', label: 'Exercise library with photos and details', tier: 'free', available: true },
  { id: 'workout-logging', label: 'Guided workout logging with rest timer', tier: 'free', available: true },
  { id: 'workout-history', label: 'Workout history and summaries', tier: 'free', available: true },
  { id: 'exercise-progress', label: 'Exercise progress and personal bests', tier: 'free', available: true },
  { id: 'nutrition-log', label: 'Food log with calorie and macro targets', tier: 'free', available: true },
  { id: 'calorie-check-in', label: 'Calorie check-ins', tier: 'free', available: true },
  { id: 'weight-tracking', label: 'Weight tracking', tier: 'free', available: true },
  { id: 'body-measurements', label: 'Body measurements', tier: 'free', available: true },
  { id: 'body-composition', label: 'Body composition records', tier: 'free', available: true },
  { id: 'inbody-report-import', label: 'Read an InBody report from a photo', tier: 'free', available: true },
  { id: 'weekly-review', label: 'Weekly fitness review', tier: 'free', available: true },
  { id: 'reminders', label: 'In-app reminders', tier: 'free', available: true },
  { id: 'account', label: 'Your StokeForm account', tier: 'free', available: true },
  { id: 'custom-workout-plan', label: 'Build and edit your own workout plan', tier: 'premium', available: true },
  { id: 'cloud-backup', label: 'Back up and sync your data across devices', tier: 'premium', available: false },
  { id: 'progress-photos', label: 'Progress photos', tier: 'premium', available: false },
  { id: 'health-app-sync', label: 'Connect health apps', tier: 'premium', available: false },
];

export function featureRule(id: FeatureId): FeatureRule {
  const rule = FEATURE_MATRIX.find((r) => r.id === id);
  if (!rule) {
    throw new RangeError(`Unknown feature: ${id}`);
  }
  return rule;
}

/** Whether this plan may use the feature now. A feature that isn't built is never accessible. */
export function canAccess(id: FeatureId, plan: Plan): boolean {
  const rule = featureRule(id);
  return rule.available && (rule.tier === 'free' || plan === 'premium');
}

export const FREE_FEATURES = FEATURE_MATRIX.filter((r) => r.tier === 'free' && r.available);
export const PREMIUM_FEATURES = FEATURE_MATRIX.filter((r) => r.tier === 'premium');
