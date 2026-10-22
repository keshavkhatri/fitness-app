import { Injectable, Injector, effect, inject, signal } from '@angular/core';

import { AUTH_API_BASE_URL, AUTH_FETCH } from '../auth/auth-api';
import { AuthService } from '../auth/auth.service';
import { RESTART_APP } from '../app-restart';
import { KeyValueStorage } from '../storage/key-value-storage';
import { TrackedKeyValueStorage, isSyncedKey } from './tracked-key-value-storage';

const STATE_KEY = 'stokeform.sync-state';
const PROFILE_KEY = 'fitness.profile';
const TIMEOUT_MS = 30_000;
/** Changes are sent a few seconds after the last one (a burst of edits goes in one request). */
const PUSH_DELAY_MS = 4_000;
/** One push request: at most this many entries / characters (the server allows 100 and 8 MiB). */
const PUSH_ENTRIES = 50;
const PUSH_CHARS = 4 * 1024 * 1024;

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'error' | 'under-age';

/** The answer to turning backup on: done, or the cloud already has data and the person must pick which to keep. */
export type EnableResult = 'enabled' | 'needs-choice' | 'failed' | 'under-age';

interface SyncState {
  /** The account backup is on for (another account on this phone starts with it off). */
  readonly enabledFor: string | null;
  /** The last server revision seen (pulls ask for what came after). */
  readonly cursor: number;
  /** The change time last sent or received for each key: a key whose change time differs has to be sent. */
  readonly synced: Readonly<Record<string, string>>;
  readonly lastSyncedAt: string | null;
}

const EMPTY: SyncState = { enabledFor: null, cursor: 0, synced: {}, lastSyncedAt: null };

interface RemoteEntry {
  readonly key: string;
  readonly value: string | null;
  readonly modifiedAt: string;
}

class SyncHttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

/**
 * Cloud backup and sync (opt-in, signed-in): the app's on-phone data, key by key (workouts, food, water, weight …),
 * copied to the server (encrypted there) so it survives a lost phone and follows the person to a new one.
 *
 * - Turning it on sends everything; if the cloud already has a backup, the person picks which to keep.
 * - After that, a change is sent a few seconds after it's made, and the app asks for changes on launch and when it
 *   comes back. For each piece of data the newest change wins (by when it was made on the phone).
 * - On a new phone (no profile yet), signing in to an account that has a backup restores it.
 * - Turning it off deletes the cloud copy; the phone keeps its data. Deleting the account deletes it too.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly storage = inject(KeyValueStorage);
  private readonly auth = inject(AuthService);
  private readonly base = inject(AUTH_API_BASE_URL);
  private readonly fetch = inject(AUTH_FETCH);
  private readonly injector = inject(Injector);
  private readonly restart = inject(RESTART_APP);
  private readonly tracked = this.storage instanceof TrackedKeyValueStorage ? this.storage : null;

  /** Backup can exist in this build (an API and change tracking). */
  readonly available = this.tracked !== null && this.base !== null;
  readonly enabled = signal(false);
  readonly status = signal<SyncStatus>('off');
  readonly lastSyncedAt = signal<string | null>(null);

  private state: SyncState = EMPTY;
  private started = false;
  private running: Promise<void> | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | undefined;
  private lastUser: string | null = null;

  /** Call once at startup; resolves after the first sync (or quickly when there is nothing to do). */
  async start(): Promise<void> {
    if (!this.available || this.started) {
      return;
    }
    this.started = true;
    this.state = await this.readState();
    this.tracked!.onChange(() => this.schedulePush());
    effect(
      () => {
        const s = this.auth.state();
        const user = s.status === 'signed-in' ? s.user.id : null;
        if (s.status === 'restoring' || user === this.lastUser) {
          return;
        }
        this.lastUser = user;
        void this.accountChanged(user);
      },
      { injector: this.injector },
    );
    // A first sync before the screens read their data (bounded: the app never waits long on the network).
    const user = (await this.auth.token()) ? this.state.enabledFor : null;
    if (user) {
      this.enabled.set(true);
      await Promise.race([this.sync(), new Promise((r) => setTimeout(r, 3_000))]);
    }
  }

  /** Sync now (on return to the app, or "Back up now"). Never throws. */
  sync(): Promise<void> {
    if (!this.enabled()) {
      return Promise.resolve();
    }
    this.running ??= this.run().finally(() => (this.running = null));
    return this.running;
  }

  /**
   * Turns backup on for the signed-in account. `keep` decides when the cloud already holds a backup and this phone has
   * data too: 'phone' replaces the backup with this phone's data, 'cloud' replaces this phone's data with the backup.
   */
  async enable(keep?: 'phone' | 'cloud'): Promise<EnableResult> {
    const user = this.auth.user()?.id;
    if (!this.available || !user) {
      return 'failed';
    }
    this.status.set('syncing');
    try {
      const remote = await this.pullAll(0);
      const hasRemote = remote.entries.some((e) => e.value !== null);
      const localKeys = await this.tracked!.syncedKeys();
      if (hasRemote && localKeys.length > 0 && !keep) {
        this.status.set('off');
        return 'needs-choice';
      }
      if (hasRemote && (keep === 'cloud' || localKeys.length === 0)) {
        await this.adopt(user, remote);
        this.restart();
        return 'enabled';
      }
      // This phone's data becomes the backup: everything on it counts as changed now, and what only the cloud has
      // is deleted there (sent as a deletion).
      const cloudOnly = remote.entries.filter((e) => e.value !== null && !localKeys.includes(e.key)).map((e) => e.key);
      await this.tracked!.markModified([...localKeys, ...cloudOnly], new Date().toISOString());
      this.state = { enabledFor: user, cursor: remote.revision, synced: {}, lastSyncedAt: null };
      await this.saveState();
      this.enabled.set(true);
      await this.run();
      return this.status() === 'under-age' ? 'under-age' : this.status() === 'idle' ? 'enabled' : 'failed';
    } catch (e) {
      this.status.set(e instanceof SyncHttpError && e.code === 'under-age' ? 'under-age' : 'error');
      return e instanceof SyncHttpError && e.code === 'under-age' ? 'under-age' : 'failed';
    }
  }

  /** Turns backup off and deletes the cloud copy (this phone keeps its data). */
  async disable(): Promise<boolean> {
    try {
      await this.post('/v1/sync/clear', {});
    } catch {
      return false;
    }
    clearTimeout(this.pushTimer);
    this.state = EMPTY;
    await this.saveState();
    this.enabled.set(false);
    this.status.set('off');
    this.lastSyncedAt.set(null);
    return true;
  }

  // --- Internals -----------------------------------------------------------------------------------------

  private async accountChanged(user: string | null): Promise<void> {
    clearTimeout(this.pushTimer);
    if (!user) {
      this.enabled.set(false);
      this.status.set('off');
      return;
    }
    if (this.state.enabledFor === user) {
      this.enabled.set(true);
      void this.sync();
      return;
    }
    this.enabled.set(false);
    this.status.set('off');
    // A new phone (no profile yet) signing in to an account with a backup: restore it.
    if (!(await this.storage.get(PROFILE_KEY))) {
      try {
        const remote = await this.pullAll(0);
        if (remote.entries.some((e) => e.key === PROFILE_KEY && e.value !== null)) {
          await this.adopt(user, remote);
          this.restart();
        }
      } catch {
        // No backup reachable: setup continues as on any new phone.
      }
    }
  }

  /** Makes the cloud's data this phone's data, and turns backup on for the account. */
  private async adopt(user: string, remote: { entries: RemoteEntry[]; revision: number }): Promise<void> {
    const synced: Record<string, string> = {};
    for (const e of remote.entries) {
      await this.tracked!.applyRemote(e.key, e.value, e.modifiedAt);
      synced[e.key] = e.modifiedAt;
    }
    this.state = { enabledFor: user, cursor: remote.revision, synced, lastSyncedAt: new Date().toISOString() };
    await this.saveState();
    this.enabled.set(true);
    this.lastSyncedAt.set(this.state.lastSyncedAt);
  }

  private schedulePush(): void {
    if (!this.enabled()) {
      return;
    }
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.sync(), PUSH_DELAY_MS);
  }

  /** Pull what changed elsewhere, then send what changed here. */
  private async run(): Promise<void> {
    this.status.set('syncing');
    try {
      const times = await this.tracked!.modifiedTimes();
      const remote = await this.pullAll(this.state.cursor);
      const synced = { ...this.state.synced };
      for (const e of remote.entries) {
        const local = times.get(e.key);
        if (!local || Date.parse(e.modifiedAt) > Date.parse(local)) {
          await this.tracked!.applyRemote(e.key, e.value, e.modifiedAt);
          synced[e.key] = e.modifiedAt;
        }
      }
      // Everything whose change time hasn't been sent (or received) yet.
      const now = await this.tracked!.modifiedTimes();
      const changed = [...now.entries()].filter(([key, at]) => isSyncedKey(key) && synced[key] !== at);
      for (const batch of await this.batches(changed)) {
        await this.post('/v1/sync/push', { entries: batch });
        for (const e of batch) {
          synced[e.key] = e.modifiedAt;
        }
      }
      this.state = { ...this.state, cursor: remote.revision, synced, lastSyncedAt: new Date().toISOString() };
      await this.saveState();
      this.lastSyncedAt.set(this.state.lastSyncedAt);
      this.status.set('idle');
    } catch (e) {
      if (e instanceof SyncHttpError && e.code === 'under-age') {
        // The server refuses to keep data of someone under 18: backup stays off.
        this.state = { ...this.state, enabledFor: null };
        await this.saveState();
        this.enabled.set(false);
        this.status.set('under-age');
      } else {
        this.status.set(e instanceof SyncHttpError ? 'error' : 'offline');
      }
    }
  }

  private async batches(changed: [string, string][]): Promise<RemoteEntry[][]> {
    const out: RemoteEntry[][] = [];
    let batch: RemoteEntry[] = [];
    let chars = 0;
    for (const [key, modifiedAt] of changed) {
      const value = await this.storage.get(key);
      const size = value?.length ?? 0;
      if (batch.length && (batch.length >= PUSH_ENTRIES || chars + size > PUSH_CHARS)) {
        out.push(batch);
        batch = [];
        chars = 0;
      }
      batch.push({ key, value, modifiedAt });
      chars += size;
    }
    if (batch.length) {
      out.push(batch);
    }
    return out;
  }

  private async pullAll(since: number): Promise<{ entries: RemoteEntry[]; revision: number }> {
    const entries: RemoteEntry[] = [];
    let revision = since;
    for (let page = 0; page < 200; page++) {
      const body = (await this.post('/v1/sync/pull', { since: revision })) as { entries?: RemoteEntry[]; revision?: number; more?: boolean };
      entries.push(...(body.entries ?? []).filter((e) => isSyncedKey(e.key)));
      revision = typeof body.revision === 'number' ? body.revision : revision;
      if (!body.more) {
        break;
      }
    }
    return { entries, revision };
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const token = await this.auth.token();
    if (!token || !this.base) {
      throw new SyncHttpError(401, 'unauthenticated');
    }
    const response = await this.fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
      throw new SyncHttpError(response.status, error?.error?.code ?? 'unavailable');
    }
    return response.status === 204 ? null : response.json();
  }

  private async readState(): Promise<SyncState> {
    try {
      const parsed = JSON.parse((await this.storage.get(STATE_KEY)) ?? 'null') as Partial<SyncState> | null;
      return {
        enabledFor: typeof parsed?.enabledFor === 'string' ? parsed.enabledFor : null,
        cursor: Number.isSafeInteger(parsed?.cursor) ? (parsed!.cursor as number) : 0,
        synced: parsed?.synced && typeof parsed.synced === 'object' ? parsed.synced : {},
        lastSyncedAt: typeof parsed?.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
      };
    } catch {
      return EMPTY;
    }
  }

  private async saveState(): Promise<void> {
    await this.storage.set(STATE_KEY, JSON.stringify(this.state)).catch(() => undefined);
    this.lastSyncedAt.set(this.state.lastSyncedAt);
  }
}
