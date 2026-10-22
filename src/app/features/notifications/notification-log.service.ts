import { Injectable, inject, signal } from '@angular/core';

import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { SentNotification, mergeSent, parseSentNotifications, samePush } from './notification-log';

const STORAGE_KEY = 'stokeform.notification-log';
const SCHEMA_VERSION = 1;

/**
 * The phone's notification history (see notification-log.ts): reminders whose time came and pushes received.
 * Writes are serialized, and recording the same notification twice keeps one entry.
 */
@Injectable({ providedIn: 'root' })
export class NotificationLogService {
  private readonly storage = inject(KeyValueStorage);
  private readonly clock = inject(CLOCK);
  private readonly current = signal<readonly SentNotification[]>([]);
  private queue: Promise<unknown> = Promise.resolve();

  /** Newest first (as of the last load or record). */
  readonly entries = this.current.asReadonly();

  async load(): Promise<readonly SentNotification[]> {
    const entries = await this.read();
    this.current.set(entries);
    return entries;
  }

  /**
   * Adds what was shown. Resolves with the key each entry is stored under (a push already recorded under
   * another name keeps that one), in order. Never throws (the history is a convenience).
   */
  record(entries: readonly SentNotification[]): Promise<readonly string[]> {
    const next = this.queue.then(async () => {
      if (entries.length === 0) {
        return [];
      }
      // Read strictly, like stored data: anything malformed is dropped.
      const merged = mergeSent(await this.read(), parseSentNotifications(entries), this.clock());
      try {
        await this.storage.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, entries: merged }));
        this.current.set(merged);
      } catch {
        // Not stored: the keys below are still the right ones for this session.
      }
      return entries.map((e) => (merged.find((m) => m.key === e.key) ?? merged.find((m) => samePush(m, e)) ?? e).key);
    });
    this.queue = next.catch(() => undefined);
    return next.catch(() => entries.map((e) => e.key));
  }

  private async read(): Promise<SentNotification[]> {
    try {
      const stored = JSON.parse((await this.storage.get(STORAGE_KEY)) ?? 'null') as { version?: unknown; entries?: unknown } | null;
      return stored?.version === SCHEMA_VERSION ? parseSentNotifications(stored.entries) : [];
    } catch {
      return [];
    }
  }
}
