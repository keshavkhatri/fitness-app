import { Injectable, inject, signal } from '@angular/core';

import { generateWorkoutPlanForProfile, planFreshness } from '../../domain/training-plan';
import { WorkoutGenerationError, WorkoutPlan } from '../../domain/workout-programming';
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
    }
  | { readonly kind: 'no-profile' }
  /** The engine could not program this profile; the typed engine error explains why. */
  | { readonly kind: 'unavailable'; readonly error: WorkoutGenerationError };

/**
 * App-wide access to the user's current workout plan.
 *
 * The plan follows the profile: it is created on first use, kept while the
 * profile's programming inputs (goal, experience, days, location, equipment)
 * are unchanged, and regenerated when they change. Profile edits that don't
 * affect programming (e.g. body weight) keep the plan.
 *
 * Product decision: regeneration is automatic because there is no workout
 * history yet. Once logging exists, replacing a plan the user is following
 * should become an explicit choice.
 */
@Injectable({ providedIn: 'root' })
export class WorkoutPlanService {
  private readonly profiles = inject(FitnessProfileService);
  private readonly repository = inject(WorkoutPlanRepository);
  private readonly config = inject(WORKOUT_PROGRAMMING_CONFIG);
  private readonly clock = inject(CLOCK);

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
