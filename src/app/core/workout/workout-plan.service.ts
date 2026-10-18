import { Injectable, inject, signal } from '@angular/core';

import {
  CustomPlanIssue,
  CustomPlanSpec,
  applyCustomPlan,
  generateWorkoutPlanForProfile,
  planFreshness,
} from '../../domain/training-plan';
import { WorkoutGenerationError, WorkoutPlan } from '../../domain/workout-programming';
import { canAccess } from '../entitlements/access-policy';
import { EntitlementService } from '../entitlements/entitlement.service';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { CLOCK, localIsoDate } from '../time/clock';
import { WorkoutPlanRepository } from './workout-plan.repository';
import { WORKOUT_PROGRAMMING_CONFIG } from './workout-programming-config.token';

export type WorkoutPlanState =
  | {
      readonly kind: 'ready';
      readonly plan: WorkoutPlan;
      /**
       * stored: the saved plan still fits the profile;
       * created: there was no (valid) saved plan;
       * regenerated: the profile's programming inputs changed since the plan was made.
       */
      readonly origin: 'stored' | 'created' | 'regenerated';
      /** False when the plan could not be persisted (it is regenerated identically next time). */
      readonly saved: boolean;
      /**
       * Custom plans only: the profile's programming inputs changed since the user built it. The plan is
       * kept as it is; switching back to a generated plan is the user's explicit choice.
       */
      readonly profileChanged?: boolean;
    }
  | { readonly kind: 'no-profile' }
  /** The engine could not program this profile; the typed engine error explains why. */
  | { readonly kind: 'unavailable'; readonly error: WorkoutGenerationError };

export type SaveCustomPlanResult =
  | { readonly kind: 'saved'; readonly plan: WorkoutPlan }
  /** The plan failed validation; nothing changed. */
  | { readonly kind: 'invalid'; readonly issues: readonly CustomPlanIssue[] }
  /** The entitlement policy doesn't allow custom plans; nothing changed. */
  | { readonly kind: 'not-allowed' }
  /** There is no current plan to customize. */
  | { readonly kind: 'unavailable' }
  /** The plan could not be written to the device; the active plan is unchanged. */
  | { readonly kind: 'save-failed' };

export type UseGeneratedPlanResult = 'switched' | 'save-failed' | 'unavailable';

/**
 * App-wide access to the user's current workout plan.
 *
 * The plan follows the profile: it is created on first use, kept while the
 * profile's programming inputs (goal, experience, days, location, equipment)
 * are unchanged, and regenerated when they change. Profile edits that don't
 * affect programming (e.g. body weight) keep the plan.
 *
 * A custom plan (Premium, see `saveCustomPlan`) is the user's own: it is never
 * regenerated automatically, whatever changes in the profile. `load()` reports
 * `profileChanged` instead, and `useGeneratedPlan()` is the explicit way back.
 *
 * Product decision: regeneration of a generated plan is automatic. Completed
 * workouts snapshot what they did, so a replaced plan never rewrites history.
 */
@Injectable({ providedIn: 'root' })
export class WorkoutPlanService {
  private readonly profiles = inject(FitnessProfileService);
  private readonly repository = inject(WorkoutPlanRepository);
  private readonly config = inject(WORKOUT_PROGRAMMING_CONFIG);
  private readonly clock = inject(CLOCK);
  private readonly entitlements = inject(EntitlementService);

  private readonly state = signal<WorkoutPlan | null>(null);
  private saved = false;
  private storedPlan: Promise<WorkoutPlan | null> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  /** The current plan once `load()` has resolved it; null before, or without a profile. */
  readonly plan = this.state.asReadonly();

  /**
   * Resolves the plan for the current profile, generating and saving it when
   * needed. Safe to call repeatedly; concurrent calls are serialized.
   */
  load(): Promise<WorkoutPlanState> {
    const next = this.queue.then(() => this.resolve());
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async resolve(): Promise<WorkoutPlanState> {
    const profile = await this.profiles.load();
    if (!profile) {
      this.state.set(null);
      return { kind: 'no-profile' };
    }

    const existing = this.state() ?? (await this.loadStored());
    if (existing?.custom) {
      this.state.set(existing);
      return { kind: 'ready', plan: existing, origin: 'stored', saved: this.saved, profileChanged: planFreshness(existing, profile) !== 'current' };
    }
    if (existing && planFreshness(existing, profile) === 'current') {
      this.state.set(existing);
      return { kind: 'ready', plan: existing, origin: 'stored', saved: this.saved };
    }

    const result = generateWorkoutPlanForProfile(profile, {
      generatedAt: localIsoDate(this.clock()),
      config: this.config,
    });
    if (!result.ok) {
      this.state.set(null);
      return { kind: 'unavailable', error: result.error };
    }
    const plan = result.value;
    try {
      await this.repository.save(plan);
      this.saved = true;
    } catch {
      // Deterministic: the same plan is generated again next time.
      this.saved = false;
    }
    this.state.set(plan);
    return { kind: 'ready', plan, origin: existing ? 'regenerated' : 'created', saved: this.saved };
  }

  /**
   * Replaces the active plan with the user's own exercises for the current plan's training days.
   * Gated by the access policy (Premium), validated, and written before it becomes active: any failure
   * leaves the active plan exactly as it was.
   */
  saveCustomPlan(spec: CustomPlanSpec): Promise<SaveCustomPlanResult> {
    const next = this.queue.then(() => this.applyCustom(spec));
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Explicit way back from a custom plan: generates a fresh plan from the profile and makes it active. */
  useGeneratedPlan(): Promise<UseGeneratedPlanResult> {
    const next = this.queue.then(() => this.regenerate());
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async applyCustom(spec: CustomPlanSpec): Promise<SaveCustomPlanResult> {
    if (this.entitlements.entitlement().status === 'loading') {
      await this.entitlements.refresh();
    }
    if (!canAccess('custom-workout-plan', this.entitlements.plan())) {
      return { kind: 'not-allowed' };
    }
    const current = await this.resolve();
    if (current.kind !== 'ready') {
      return { kind: 'unavailable' };
    }
    const result = applyCustomPlan(current.plan, spec, localIsoDate(this.clock()), { config: this.config });
    if (!result.ok) {
      return { kind: 'invalid', issues: result.issues };
    }
    try {
      await this.repository.save(result.value);
    } catch {
      return { kind: 'save-failed' };
    }
    this.saved = true;
    this.storedPlan = Promise.resolve(result.value);
    this.state.set(result.value);
    return { kind: 'saved', plan: result.value };
  }

  private async regenerate(): Promise<UseGeneratedPlanResult> {
    const profile = await this.profiles.load();
    if (!profile) {
      return 'unavailable';
    }
    const result = generateWorkoutPlanForProfile(profile, { generatedAt: localIsoDate(this.clock()), config: this.config });
    if (!result.ok) {
      return 'unavailable';
    }
    try {
      await this.repository.save(result.value);
    } catch {
      // The user's current plan stays active: a failed write must not drop it.
      return 'save-failed';
    }
    this.saved = true;
    this.storedPlan = Promise.resolve(result.value);
    this.state.set(result.value);
    return 'switched';
  }

  /** Reads the saved plan once; a failed read is retried on the next call. */
  private loadStored(): Promise<WorkoutPlan | null> {
    this.storedPlan ??= this.repository.load().then(
      (plan) => {
        this.saved = plan !== null;
        return plan;
      },
      () => {
        this.storedPlan = null;
        return null;
      },
    );
    return this.storedPlan;
  }
}
