import { Injectable, computed, inject, signal } from '@angular/core';

import {
  DEFAULT_GOALS,
  DailyGoals,
  isValidStepGoal,
  isValidWaterGoal,
  parseDailyGoals,
  stepGoalOf,
} from '../../domain/daily-check-in';
import { KeyValueStorage } from '../storage/key-value-storage';

const STORAGE_KEY = 'fitness.daily-goals';
const SCHEMA_VERSION = 1;

/**
 * The person's daily goals (steps and water): their own number, or the app's suggestion when they haven't set
 * one. Kept on the device like the other settings (and in the cloud backup, if it's on).
 */
@Injectable({ providedIn: 'root' })
export class GoalsService {
  private readonly storage = inject(KeyValueStorage);
  private readonly current = signal<DailyGoals>(DEFAULT_GOALS);

  readonly goals = this.current.asReadonly();
  /** Steps a day in effect (the person's, else 10,000). */
  readonly stepGoal = computed(() => stepGoalOf(this.current()));
  /** The water goal the person set (ml), or null for the suggestion from body weight. */
  readonly waterOverrideMl = computed(() => this.current().waterMl);

  async load(): Promise<DailyGoals> {
    let goals = DEFAULT_GOALS;
    try {
      const stored = JSON.parse((await this.storage.get(STORAGE_KEY)) ?? 'null') as { version?: unknown; goals?: unknown } | null;
      if (stored?.version === SCHEMA_VERSION) {
        goals = parseDailyGoals(stored.goals);
      }
    } catch {
      // Unreadable settings read as the defaults.
    }
    this.current.set(goals);
    return goals;
  }

  /** Sets the step goal (null: back to the default). Rejects a value outside the range and failed writes. */
  setSteps(steps: number | null): Promise<void> {
    if (steps !== null && !isValidStepGoal(steps)) {
      return Promise.reject(new RangeError('The step goal is outside the allowed range.'));
    }
    return this.save({ ...this.current(), steps });
  }

  /** Sets the water goal in ml (null: back to the suggestion). Rejects a value outside the range and failed writes. */
  setWaterMl(waterMl: number | null): Promise<void> {
    if (waterMl !== null && !isValidWaterGoal(waterMl)) {
      return Promise.reject(new RangeError('The water goal is outside the allowed range.'));
    }
    return this.save({ ...this.current(), waterMl });
  }

  private async save(next: DailyGoals): Promise<void> {
    await this.storage.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, goals: next }));
    this.current.set(next);
  }
}
