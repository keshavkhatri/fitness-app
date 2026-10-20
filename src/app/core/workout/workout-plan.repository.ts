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
  /** A custom plan set aside while Pro is off (restored when Pro is back); null when there is none. */
  abstract loadParked(): Promise<WorkoutPlan | null>;
  /** Sets a custom plan aside (or, with null, forgets it). Rejects if it could not be written. */
  abstract saveParked(plan: WorkoutPlan | null): Promise<void>;
}

const STORAGE_KEY = 'fitness.workout-plan';
const PARKED_KEY = 'fitness.workout-plan-parked';
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

  load(): Promise<WorkoutPlan | null> {
    return this.read(STORAGE_KEY);
  }

  loadParked(): Promise<WorkoutPlan | null> {
    return this.read(PARKED_KEY);
  }

  async saveParked(plan: WorkoutPlan | null): Promise<void> {
    if (plan) {
      await this.storage.set(PARKED_KEY, JSON.stringify({ version: SCHEMA_VERSION, plan } satisfies StoredWorkoutPlan));
    } else {
      await this.storage.remove(PARKED_KEY);
    }
  }

  private async read(key: string): Promise<WorkoutPlan | null> {
    const raw = await this.storage.get(key);
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
