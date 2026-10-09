import { Injectable, inject } from '@angular/core';

import { parseWorkoutPlan } from '../../domain/training-plan';
import { WorkoutPlan } from '../../domain/workout-programming';
import { KeyValueStorage } from '../storage/key-value-storage';

/**
 * Persistence boundary for the user's current workout plan.
 *
 * The plan is stored as a full snapshot (not regenerated on load), so a later
 * engine version can never silently change the program a user is following.
 *
 * Today: `LocalWorkoutPlanRepository` (device storage). Later: an API-backed
 * implementation provided in its place; callers don't change.
 */
@Injectable({ providedIn: 'root', useFactory: () => new LocalWorkoutPlanRepository(inject(KeyValueStorage)) })
export abstract class WorkoutPlanRepository {
  /** Resolves null when no (valid) plan is stored. */
  abstract load(): Promise<WorkoutPlan | null>;
  /** Rejects if the plan could not be saved. */
  abstract save(plan: WorkoutPlan): Promise<void>;
}

const STORAGE_KEY = 'fitness.workout-plan';
/**
 * Storage envelope version (independent of `workoutProgrammingVersion`, which
 * the plan carries itself). Future envelope versions add a migration step.
 */
const SCHEMA_VERSION = 1;

interface StoredWorkoutPlan {
  version: number;
  plan: unknown;
}

/**
 * Same storage caveat as the profile (see TODO(security) in
 * fitness-profile.repository.ts): plain JSON in device storage. The plan holds
 * goal, experience and training setup, but no body data.
 */
export class LocalWorkoutPlanRepository implements WorkoutPlanRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  async load(): Promise<WorkoutPlan | null> {
    const raw = await this.storage.get(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      const stored = JSON.parse(raw) as Partial<StoredWorkoutPlan>;
      return stored.version === SCHEMA_VERSION ? parseWorkoutPlan(stored.plan) : null;
    } catch {
      return null;
    }
  }

  async save(plan: WorkoutPlan): Promise<void> {
    const stored: StoredWorkoutPlan = { version: SCHEMA_VERSION, plan };
    await this.storage.set(STORAGE_KEY, JSON.stringify(stored));
  }
}
