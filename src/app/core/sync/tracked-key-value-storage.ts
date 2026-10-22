import type { KeyValueStorage } from '../storage/key-value-storage';

/** Where the change times are kept (on this phone only; never synced). */
export const SYNC_META_KEY = 'stokeform.sync-meta';

/**
 * What is synced: the app's own data keys, except what belongs to this phone only (its sync state, the reminder
 * schedule and notification history, a workout in progress, unfinished onboarding, test access and the theme).
 */
const APP_PREFIXES = ['fitness.', 'stokeform.'];
const DEVICE_ONLY: ReadonlySet<string> = new Set([
  SYNC_META_KEY,
  'stokeform.sync-state',
  'stokeform.reminders-scheduled',
  'stokeform.reminders-planned',
  'stokeform.notification-log',
  'stokeform.test-access',
  'stokeform.onboarding-report',
  'fitness.workout-active',
  'fitness.onboarding-progress',
  'fitness.theme-preference',
]);

export const isSyncedKey = (key: string) => APP_PREFIXES.some((p) => key.startsWith(p)) && !DEVICE_ONLY.has(key);

/**
 * Storage that remembers when each synced key last changed on this phone (for cloud sync: core/sync). Reads and
 * writes go straight to the store underneath (encrypted on the phone); only the change times are added. Changes
 * that come from the cloud are written with `applyRemote`, which keeps the cloud's time, so they aren't sent back.
 */
export class TrackedKeyValueStorage implements KeyValueStorage {
  private modified: Promise<Map<string, string>> | null = null;
  private writing: Promise<unknown> = Promise.resolve();
  private readonly listeners: ((key: string) => void)[] = [];

  /** `inner`: the store underneath (encrypted on the phone). */
  constructor(readonly inner: KeyValueStorage) {}

  get(key: string): Promise<string | null> {
    return this.inner.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    await this.inner.set(key, value);
    if (isSyncedKey(key)) {
      await this.touch(key, new Date().toISOString());
      this.listeners.forEach((listener) => listener(key));
    }
  }

  async remove(key: string): Promise<void> {
    await this.inner.remove(key);
    if (isSyncedKey(key)) {
      await this.touch(key, new Date().toISOString());
      this.listeners.forEach((listener) => listener(key));
    }
  }

  keys(): Promise<string[]> {
    return this.inner.keys();
  }

  /** Called after a synced key changes on this phone (to schedule a sync). */
  onChange(listener: (key: string) => void): void {
    this.listeners.push(listener);
  }

  /** When each synced key last changed (ISO), as far as this phone knows. */
  async modifiedTimes(): Promise<ReadonlyMap<string, string>> {
    return new Map(await this.times());
  }

  /** Every synced key that has a value now (for a first backup). */
  async syncedKeys(): Promise<string[]> {
    return (await this.inner.keys()).filter(isSyncedKey);
  }

  /** Marks keys as changed at `at` (e.g. everything already on the phone, when backup is first turned on). */
  async markModified(keys: readonly string[], at: string): Promise<void> {
    for (const key of keys) {
      await this.touch(key, at);
    }
  }

  /** Writes a change that came from the cloud, with the cloud's time (null deletes). Not reported as a local change. */
  async applyRemote(key: string, value: string | null, modifiedAt: string): Promise<void> {
    if (!isSyncedKey(key)) {
      return;
    }
    if (value === null) {
      await this.inner.remove(key);
    } else {
      await this.inner.set(key, value);
    }
    await this.touch(key, modifiedAt);
  }

  private async touch(key: string, at: string): Promise<void> {
    const times = await this.times();
    times.set(key, at);
    // Serialized: a quick series of changes can't write an older map over a newer one.
    const next = this.writing.then(() => this.inner.set(SYNC_META_KEY, JSON.stringify(Object.fromEntries(times))));
    this.writing = next.catch(() => undefined);
    await next.catch(() => undefined);
  }

  private times(): Promise<Map<string, string>> {
    this.modified ??= this.inner
      .get(SYNC_META_KEY)
      .then((raw) => {
        const parsed = raw ? (JSON.parse(raw) as unknown) : {};
        const entries = parsed && typeof parsed === 'object' ? Object.entries(parsed as Record<string, unknown>) : [];
        return new Map(entries.filter((e): e is [string, string] => typeof e[1] === 'string' && !Number.isNaN(Date.parse(e[1]))));
      })
      .catch(() => new Map<string, string>());
    return this.modified;
  }
}
