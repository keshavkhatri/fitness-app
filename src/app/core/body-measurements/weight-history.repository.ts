import { Injectable, inject } from '@angular/core';

import { WeightEntry, parseWeightEntry, sortWeightEntries } from '../../domain/body-measurements';
import { KeyValueStorage } from '../storage/key-value-storage';

/** Stored weight history can't be read or written safely (details aren't shown to users). */
export class WeightHistoryStorageError extends Error {
  constructor(readonly reason: 'unsupported-version' | 'write-failed' | 'not-found' | 'duplicate-id') {
    super(`Weight history storage: ${reason}`);
  }
}

/**
 * Persistence boundary for recorded body weights.
 *
 * Today: `LocalWeightHistoryRepository` (this device only; no sync). It is
 * deliberately separate from the profile: nothing here reads or writes the
 * profile's weight.
 */
@Injectable({ providedIn: 'root', useFactory: () => new LocalWeightHistoryRepository(inject(KeyValueStorage)) })
export abstract class WeightHistoryRepository {
  /** All readable entries, oldest first. */
  abstract list(): Promise<WeightEntry[]>;
  /** Each write rejects with WeightHistoryStorageError when nothing was saved. */
  abstract add(entry: WeightEntry): Promise<void>;
  abstract update(entry: WeightEntry): Promise<void>;
  abstract remove(id: string): Promise<void>;
}

const STORAGE_KEY = 'fitness.body-weight-entries';
const SCHEMA_VERSION = 1;

/**
 * Same storage caveat as the profile (see TODO(security) in
 * fitness-profile.repository.ts): plain JSON in device storage.
 */
export class LocalWeightHistoryRepository implements WeightHistoryRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  async list(): Promise<WeightEntry[]> {
    const items = await this.read();
    return sortWeightEntries(items.map(parseWeightEntry).filter((e): e is WeightEntry => e !== null));
  }

  async add(entry: WeightEntry): Promise<void> {
    const items = await this.read();
    if (items.some((item) => idOf(item) === entry.id)) {
      throw new WeightHistoryStorageError('duplicate-id');
    }
    await this.write([...items, entry]);
  }

  async update(entry: WeightEntry): Promise<void> {
    const items = await this.read();
    if (!items.some((item) => idOf(item) === entry.id)) {
      throw new WeightHistoryStorageError('not-found');
    }
    await this.write(items.map((item) => (idOf(item) === entry.id ? entry : item)));
  }

  async remove(id: string): Promise<void> {
    const items = await this.read();
    await this.write(items.filter((item) => idOf(item) !== id));
  }

  /**
   * Raw stored items: unreadable ones are kept as they are on the next write
   * rather than silently dropped. Nothing stored or unparseable JSON → empty.
   * A newer, unknown envelope version → error, so it is never overwritten.
   */
  private async read(): Promise<unknown[]> {
    const raw = await this.storage.get(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    const envelope = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
    if (!envelope || !Array.isArray(envelope['entries'])) {
      return [];
    }
    if (envelope['version'] !== SCHEMA_VERSION) {
      throw new WeightHistoryStorageError('unsupported-version');
    }
    return envelope['entries'] as unknown[];
  }

  private async write(items: unknown[]): Promise<void> {
    try {
      await this.storage.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, entries: items }));
    } catch {
      throw new WeightHistoryStorageError('write-failed');
    }
  }
}

const idOf = (item: unknown) => (typeof item === 'object' && item !== null ? (item as Record<string, unknown>)['id'] : undefined);
