import { Injectable, inject } from '@angular/core';

import { MeasurementEntry, parseMeasurementEntry, sortMeasurementEntries } from '../../domain/body-measurements';
import { KeyValueStorage } from '../storage/key-value-storage';

/** Stored measurements can't be read or written safely (details aren't shown to users). */
export class MeasurementHistoryStorageError extends Error {
  constructor(readonly reason: 'unreadable' | 'unsupported-version' | 'write-failed' | 'not-found' | 'duplicate-id') {
    super(`Measurement history storage: ${reason}`);
  }
}

/**
 * Persistence boundary for recorded body measurements.
 *
 * Today: `LocalMeasurementHistoryRepository` (this device only; no sync).
 * Separate from the profile and from weight history: nothing here reads or
 * writes either.
 */
@Injectable({ providedIn: 'root', useFactory: () => new LocalMeasurementHistoryRepository(inject(KeyValueStorage)) })
export abstract class MeasurementHistoryRepository {
  /** All readable entries, oldest first. */
  abstract list(): Promise<MeasurementEntry[]>;
  /** Each write rejects with MeasurementHistoryStorageError when nothing was saved. */
  abstract add(entry: MeasurementEntry): Promise<void>;
  abstract update(entry: MeasurementEntry): Promise<void>;
  abstract remove(id: string): Promise<void>;
  /** A stored item with this id exists but can't be read (e.g. sites from a newer version). Read-only. */
  abstract hasUnreadable(id: string): Promise<boolean>;
  /** How many stored items can't be read (kept, but not listed). Read-only. */
  abstract countUnreadable(): Promise<number>;
}

const STORAGE_KEY = 'fitness.body-measurement-entries';
const SCHEMA_VERSION = 1;

/**
 * Same storage caveat as the profile (see TODO(security) in
 * fitness-profile.repository.ts): plain JSON in device storage.
 */
export class LocalMeasurementHistoryRepository implements MeasurementHistoryRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  async list(): Promise<MeasurementEntry[]> {
    const items = await this.read();
    return sortMeasurementEntries(items.map(parseMeasurementEntry).filter((e): e is MeasurementEntry => e !== null));
  }

  async add(entry: MeasurementEntry): Promise<void> {
    const items = await this.read();
    if (items.some((item) => idOf(item) === entry.id)) {
      throw new MeasurementHistoryStorageError('duplicate-id');
    }
    await this.write([...items, entry]);
  }

  /** Replaces the readable entry with this id; unreadable items (e.g. with sites from a newer version) are never touched. */
  async update(entry: MeasurementEntry): Promise<void> {
    const items = await this.read();
    if (!items.some((item) => isReadable(item, entry.id))) {
      throw new MeasurementHistoryStorageError('not-found');
    }
    await this.write(items.map((item) => (isReadable(item, entry.id) ? entry : item)));
  }

  /** Removes the readable entry with this id; unreadable items are kept. */
  async remove(id: string): Promise<void> {
    const items = await this.read();
    await this.write(items.filter((item) => !isReadable(item, id)));
  }

  async hasUnreadable(id: string): Promise<boolean> {
    const items = await this.read();
    return items.some((item) => idOf(item) === id && parseMeasurementEntry(item) === null);
  }

  async countUnreadable(): Promise<number> {
    const items = await this.read();
    return items.filter((item) => parseMeasurementEntry(item) === null).length;
  }

  /**
   * Raw stored items: unreadable ones are kept as they are on the next write
   * rather than silently dropped. Nothing stored → empty. Anything else that
   * isn't a version-1 envelope (corrupt JSON, another shape, a newer
   * version) → error, so it is never overwritten.
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
      throw new MeasurementHistoryStorageError('unreadable');
    }
    const envelope = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    if (!envelope) {
      throw new MeasurementHistoryStorageError('unreadable');
    }
    if (envelope['version'] !== SCHEMA_VERSION) {
      throw new MeasurementHistoryStorageError('unsupported-version');
    }
    if (!Array.isArray(envelope['entries'])) {
      throw new MeasurementHistoryStorageError('unreadable');
    }
    return envelope['entries'] as unknown[];
  }

  private async write(items: unknown[]): Promise<void> {
    try {
      await this.storage.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, entries: items }));
    } catch {
      throw new MeasurementHistoryStorageError('write-failed');
    }
  }
}

const idOf = (item: unknown) => (typeof item === 'object' && item !== null ? (item as Record<string, unknown>)['id'] : undefined);
const isReadable = (item: unknown, id: string) => idOf(item) === id && parseMeasurementEntry(item) !== null;
