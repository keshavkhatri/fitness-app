import { Injectable, inject } from '@angular/core';

import {
  BodyCompositionAssessment,
  parseBodyCompositionAssessment,
  sortBodyCompositionAssessments,
} from '../../domain/body-composition';
import { KeyValueStorage } from '../storage/key-value-storage';

/** Stored assessments can't be read or written safely (details aren't shown to users). */
export class BodyCompositionHistoryStorageError extends Error {
  constructor(readonly reason: 'unreadable' | 'unsupported-version' | 'write-failed' | 'duplicate-id' | 'invalid-assessment') {
    super(`Body composition history storage: ${reason}`);
  }
}

/**
 * Persistence boundary for body-composition assessments.
 *
 * Today: `LocalBodyCompositionHistoryRepository` (this device only; no sync).
 * Separate from the profile, weight history and tape measurements: nothing
 * here reads or writes any of them. Add-only for now: assessments are not
 * edited or deleted yet.
 */
@Injectable({ providedIn: 'root', useFactory: () => new LocalBodyCompositionHistoryRepository(inject(KeyValueStorage)) })
export abstract class BodyCompositionHistoryRepository {
  /** All readable assessments, oldest first (date, creation time, id). */
  abstract list(): Promise<BodyCompositionAssessment[]>;
  /** Rejects with BodyCompositionHistoryStorageError when nothing was saved. */
  abstract add(assessment: BodyCompositionAssessment): Promise<void>;
  /** How many stored items can't be read (kept as they are, but not listed). Read-only. */
  abstract countUnreadable(): Promise<number>;
}

export const BODY_COMPOSITION_STORAGE_KEY = 'fitness.body-composition-assessments';
export const BODY_COMPOSITION_SCHEMA_VERSION = 1;

/**
 * Stored as `{ "version": 1, "assessments": [...] }` under its own key; each
 * item is a `BodyCompositionAssessment` as JSON (values and provenance as
 * recorded, no conversion). Raw report content is never stored here.
 *
 * Same storage caveat as the profile (see TODO(security) in
 * fitness-profile.repository.ts): plain JSON in device storage.
 */
export class LocalBodyCompositionHistoryRepository implements BodyCompositionHistoryRepository {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly storage: KeyValueStorage) {}

  async list(): Promise<BodyCompositionAssessment[]> {
    const items = await this.read();
    return sortBodyCompositionAssessments(
      items.map(parseBodyCompositionAssessment).filter((a): a is BodyCompositionAssessment => a !== null),
    );
  }

  /**
   * Appends; every stored item, readable or not, is kept exactly as it was.
   * Adds run one at a time (read, then write), so rapid saves can't overwrite each other.
   */
  add(assessment: BodyCompositionAssessment): Promise<void> {
    const next = this.queue.then(async () => {
      // Only store what reads back as the same assessment, so a save never creates an unreadable record.
      const stored: unknown = JSON.parse(JSON.stringify(assessment));
      if (!isSame(parseBodyCompositionAssessment(stored), stored)) {
        throw new BodyCompositionHistoryStorageError('invalid-assessment');
      }
      const items = await this.read();
      if (items.some((item) => idOf(item) === assessment.id)) {
        throw new BodyCompositionHistoryStorageError('duplicate-id');
      }
      await this.write([...items, stored]);
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  async countUnreadable(): Promise<number> {
    const items = await this.read();
    return items.filter((item) => parseBodyCompositionAssessment(item) === null).length;
  }

  /**
   * Raw stored items. Nothing stored → empty. Anything else that isn't a
   * version-1 envelope (corrupt JSON, another shape, a newer version) →
   * error, so it is never overwritten.
   */
  private async read(): Promise<unknown[]> {
    const raw = await this.storage.get(BODY_COMPOSITION_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BodyCompositionHistoryStorageError('unreadable');
    }
    const envelope = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    if (!envelope) {
      throw new BodyCompositionHistoryStorageError('unreadable');
    }
    if (envelope['version'] !== BODY_COMPOSITION_SCHEMA_VERSION) {
      throw new BodyCompositionHistoryStorageError('unsupported-version');
    }
    if (!Array.isArray(envelope['assessments'])) {
      throw new BodyCompositionHistoryStorageError('unreadable');
    }
    return envelope['assessments'] as unknown[];
  }

  private async write(items: unknown[]): Promise<void> {
    try {
      await this.storage.set(
        BODY_COMPOSITION_STORAGE_KEY,
        JSON.stringify({ version: BODY_COMPOSITION_SCHEMA_VERSION, assessments: items }),
      );
    } catch {
      throw new BodyCompositionHistoryStorageError('write-failed');
    }
  }
}

const idOf = (item: unknown) => (typeof item === 'object' && item !== null ? (item as Record<string, unknown>)['id'] : undefined);
/** Deep equality of JSON values, ignoring key order. */
function isSame(a: unknown, b: unknown): boolean {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return a === b;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const aKeys = Object.keys(a);
  const bRecord = b as Record<string, unknown>;
  return (
    aKeys.length === Object.keys(b).length &&
    aKeys.every((key) => Object.hasOwn(bRecord, key) && isSame((a as Record<string, unknown>)[key], bRecord[key]))
  );
}
