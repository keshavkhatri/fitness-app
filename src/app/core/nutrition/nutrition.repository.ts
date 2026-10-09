import { Injectable, inject } from '@angular/core';

import { IsoCalendarDate } from '../../domain/fitness-profile';
import { FoodEntry, entriesBetween, entriesOn, parseFoodEntry } from '../../domain/nutrition';
import { KeyValueStorage } from '../storage/key-value-storage';

/** Stored food data can't be read or written safely (details aren't shown to users). */
export class NutritionStorageError extends Error {
  constructor(readonly reason: 'unsupported-version' | 'write-failed' | 'not-found') {
    super(`Nutrition storage: ${reason}`);
  }
}

/**
 * Persistence boundary for logged food. Totals are never stored: they are
 * derived from the entries of the requested day.
 *
 * Today: `LocalNutritionRepository` (this device only; no sync across
 * devices). Later: an API-backed implementation provided in its place.
 */
@Injectable({ providedIn: 'root', useFactory: () => new LocalNutritionRepository(inject(KeyValueStorage)) })
export abstract class NutritionRepository {
  /** Entries eaten on a local calendar date. */
  abstract loadDay(date: IsoCalendarDate): Promise<FoodEntry[]>;
  /** Entries with `from <= date <= to` (for future trends). */
  abstract loadRange(from: IsoCalendarDate, to: IsoCalendarDate): Promise<FoodEntry[]>;
  /** Each write rejects with NutritionStorageError when nothing was saved. */
  abstract add(entry: FoodEntry): Promise<void>;
  abstract update(entry: FoodEntry): Promise<void>;
  abstract remove(id: string): Promise<void>;
}

const STORAGE_KEY = 'fitness.nutrition-entries';
const SCHEMA_VERSION = 1;

interface Stored {
  /** Raw items: unreadable ones are kept as they are rather than silently dropped on the next write. */
  readonly items: unknown[];
}

/**
 * Same storage caveat as the profile (see TODO(security) in
 * fitness-profile.repository.ts): plain JSON in device storage.
 */
export class LocalNutritionRepository implements NutritionRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  async loadDay(date: IsoCalendarDate): Promise<FoodEntry[]> {
    return entriesOn(await this.entries(), date);
  }

  async loadRange(from: IsoCalendarDate, to: IsoCalendarDate): Promise<FoodEntry[]> {
    return entriesBetween(await this.entries(), from, to);
  }

  async add(entry: FoodEntry): Promise<void> {
    const { items } = await this.read();
    await this.write([...items.filter((item) => idOf(item) !== entry.id), entry]);
  }

  async update(entry: FoodEntry): Promise<void> {
    const { items } = await this.read();
    if (!items.some((item) => idOf(item) === entry.id)) {
      throw new NutritionStorageError('not-found');
    }
    await this.write(items.map((item) => (idOf(item) === entry.id ? entry : item)));
  }

  async remove(id: string): Promise<void> {
    const { items } = await this.read();
    await this.write(items.filter((item) => idOf(item) !== id));
  }

  private async entries(): Promise<FoodEntry[]> {
    return (await this.read()).items.map(parseFoodEntry).filter((e): e is FoodEntry => e !== null);
  }

  /**
   * Nothing stored or unparseable JSON → empty (nothing readable to lose).
   * A newer, unknown envelope version → error, so it is never overwritten.
   */
  private async read(): Promise<Stored> {
    const raw = await this.storage.get(STORAGE_KEY);
    if (!raw) {
      return { items: [] };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { items: [] };
    }
    const envelope = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
    if (!envelope || !Array.isArray(envelope['entries'])) {
      return { items: [] };
    }
    if (envelope['version'] !== SCHEMA_VERSION) {
      throw new NutritionStorageError('unsupported-version');
    }
    return { items: envelope['entries'] as unknown[] };
  }

  private async write(items: unknown[]): Promise<void> {
    try {
      await this.storage.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, entries: items }));
    } catch {
      throw new NutritionStorageError('write-failed');
    }
  }
}

const idOf = (item: unknown) => (typeof item === 'object' && item !== null ? (item as Record<string, unknown>)['id'] : undefined);
