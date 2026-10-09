import { Injectable, inject } from '@angular/core';

import { WorkoutLog, parseWorkoutLog } from '../../domain/workout-session';
import { KeyValueStorage } from '../storage/key-value-storage';

/**
 * Persistence boundary for performed workouts (never the plan).
 *
 * - One active slot: the in-progress workout, so an interrupted workout can be
 *   resumed after the app is closed.
 * - Finished workouts: the workout history.
 *
 * Finished workouts are kept indefinitely (no retention limit, no automatic
 * deletion). Storage management (size limits, archiving, sync) is a future
 * concern once a backend exists.
 *
 * Today: `LocalWorkoutLogRepository` (device storage). Later: a backend/sync
 * implementation provided in its place; callers don't change.
 */
@Injectable({ providedIn: 'root', useFactory: () => new LocalWorkoutLogRepository(inject(KeyValueStorage)) })
export abstract class WorkoutLogRepository {
  /** The in-progress workout, or null (none, finished, or unreadable). */
  abstract loadActive(): Promise<WorkoutLog | null>;
  /** Rejects if it could not be saved. */
  abstract saveActive(log: WorkoutLog): Promise<void>;
  abstract clearActive(): Promise<void>;
  /** Stores a finished workout and clears the active slot. Rejects if it could not be saved. */
  abstract saveCompleted(log: WorkoutLog): Promise<void>;
  abstract loadCompleted(id: string): Promise<WorkoutLog | null>;
  /** Every readable finished workout (order unspecified). Rejects if storage can't be read. */
  abstract listCompleted(): Promise<WorkoutLog[]>;
}

const ACTIVE_KEY = 'fitness.workout-active';
const COMPLETED_KEY = 'fitness.workout-logs';
/** Storage envelope version (independent of the plan's programming version). */
const SCHEMA_VERSION = 1;

/**
 * Same storage caveat as the profile and plan (see TODO(security) in
 * fitness-profile.repository.ts): plain JSON in device storage.
 */
export class LocalWorkoutLogRepository implements WorkoutLogRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  async loadActive(): Promise<WorkoutLog | null> {
    const stored = await this.read(ACTIVE_KEY);
    const log = stored && typeof stored === 'object' && 'log' in stored ? parseWorkoutLog(stored.log) : null;
    return log?.status === 'in-progress' ? log : null;
  }

  async saveActive(log: WorkoutLog): Promise<void> {
    await this.storage.set(ACTIVE_KEY, JSON.stringify({ version: SCHEMA_VERSION, log }));
  }

  async clearActive(): Promise<void> {
    await this.storage.remove(ACTIVE_KEY);
  }

  async saveCompleted(log: WorkoutLog): Promise<void> {
    const logs = (await this.completed()).filter((l) => l.id !== log.id);
    await this.storage.set(COMPLETED_KEY, JSON.stringify({ version: SCHEMA_VERSION, logs: [...logs, log] }));
    await this.clearActive();
  }

  async loadCompleted(id: string): Promise<WorkoutLog | null> {
    return (await this.completed()).find((l) => l.id === id) ?? null;
  }

  listCompleted(): Promise<WorkoutLog[]> {
    return this.completed();
  }

  /** Readable finished workouts; unreadable entries are dropped rather than failing the list. */
  private async completed(): Promise<WorkoutLog[]> {
    const stored = await this.read(COMPLETED_KEY);
    const logs = stored && typeof stored === 'object' && 'logs' in stored && Array.isArray(stored.logs) ? stored.logs : [];
    return logs.map(parseWorkoutLog).filter((l): l is WorkoutLog => l?.status === 'completed');
  }

  private async read(key: string): Promise<{ log?: unknown; logs?: unknown } | null> {
    try {
      const parsed = JSON.parse((await this.storage.get(key)) ?? 'null') as Record<string, unknown> | null;
      return parsed?.['version'] === SCHEMA_VERSION ? parsed : null;
    } catch {
      return null;
    }
  }
}
