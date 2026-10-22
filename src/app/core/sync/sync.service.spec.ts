import { Injector, computed, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { RESTART_APP } from '../app-restart';
import { AUTH_API_BASE_URL, AUTH_FETCH } from '../auth/auth-api';
import { AuthService, AuthState } from '../auth/auth.service';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { SyncService } from './sync.service';
import { SYNC_META_KEY, TrackedKeyValueStorage, isSyncedKey } from './tracked-key-value-storage';

/** A tiny stand-in for the server's sync routes (server/src/sync): newest change wins per key, revisions grow. */
function fakeCloud() {
  const rows = new Map<string, { value: string | null; modifiedAt: string; revision: number }>();
  let revision = 0;
  let underAge = false;
  const calls: string[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    calls.push(path);
    const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
    const json = (status: number, data: unknown) => new Response(status === 204 ? null : JSON.stringify(data), { status });
    if (path === '/v1/sync/clear') {
      rows.clear();
      return json(204, null);
    }
    if (path === '/v1/sync/pull') {
      const since = Number(body['since']);
      const entries = [...rows.entries()]
        .filter(([, r]) => r.revision > since)
        .sort((a, b) => a[1].revision - b[1].revision)
        .map(([key, r]) => ({ key, value: r.value, modifiedAt: r.modifiedAt, revision: r.revision }));
      return json(200, { entries, revision: entries.at(-1)?.revision ?? since, more: false });
    }
    if (underAge) {
      return json(403, { error: { code: 'under-age' } });
    }
    let accepted = 0;
    for (const e of body['entries'] as { key: string; value: string | null; modifiedAt: string }[]) {
      const current = rows.get(e.key);
      if (!current || Date.parse(current.modifiedAt) < Date.parse(e.modifiedAt)) {
        rows.set(e.key, { value: e.value, modifiedAt: e.modifiedAt, revision: ++revision });
        accepted++;
      }
    }
    return json(200, { accepted, revision });
  }) as unknown as typeof globalThis.fetch;
  return { rows, fetch, calls, refuseUnderAge: () => (underAge = true) };
}

function fakeAuth(userId: string | null) {
  const state = signal<AuthState>(userId ? { status: 'signed-in', user: { id: userId, email: 'a@example.test', name: 'A', emailVerified: true }, verified: true } : { status: 'guest' });
  return {
    state: state.asReadonly(),
    user: computed(() => {
      const s = state();
      return s.status === 'signed-in' ? s.user : null;
    }),
    token: async () => (state().status === 'signed-in' ? 'token' : null),
    signIn: (id: string) => state.set({ status: 'signed-in', user: { id, email: 'a@example.test', name: 'A', emailVerified: true }, verified: true }),
  };
}

/** One phone: its own storage and services, sharing the cloud. */
function phone(cloud: ReturnType<typeof fakeCloud>, userId: string | null = 'u1') {
  const memory = new MemoryKeyValueStorage();
  const storage = new TrackedKeyValueStorage(memory);
  const auth = fakeAuth(userId);
  const restart = vi.fn();
  const injector = Injector.create({
    providers: [
      { provide: KeyValueStorage, useValue: storage },
      { provide: AuthService, useValue: auth },
      { provide: AUTH_API_BASE_URL, useValue: 'https://api.example' },
      { provide: AUTH_FETCH, useValue: cloud.fetch },
      { provide: RESTART_APP, useValue: restart },
      { provide: SyncService },
    ],
    parent: TestBed.inject(Injector),
  });
  const sync = runInInjectionContext(injector, () => injector.get(SyncService));
  return { memory, storage, auth, restart, sync };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
    TestBed.tick();
  }
};

describe('TrackedKeyValueStorage', () => {
  it('records when synced keys change (not device-only ones), and cloud changes keep the cloud time silently', async () => {
    const storage = new TrackedKeyValueStorage(new MemoryKeyValueStorage());
    const changed: string[] = [];
    storage.onChange((k) => changed.push(k));
    await storage.set('fitness.water-log', '{}');
    await storage.set('stokeform.reminders-scheduled', '[]');
    await storage.set('fitness.theme-preference', '"dark"');
    await storage.applyRemote('fitness.profile', '{"p":1}', '2026-10-01T00:00:00.000Z');
    const times = await storage.modifiedTimes();
    expect([...times.keys()].sort()).toEqual(['fitness.profile', 'fitness.water-log']);
    expect(times.get('fitness.profile')).toBe('2026-10-01T00:00:00.000Z');
    expect(changed).toEqual(['fitness.water-log']);
    expect(isSyncedKey(SYNC_META_KEY)).toBe(false);
    expect(isSyncedKey('fitness.workout-active')).toBe(false);
    expect(isSyncedKey('fitness.workout-logs')).toBe(true);
  });
});

describe('SyncService', () => {
  it('turning backup on sends everything on this phone; changes then follow to another phone', async () => {
    const cloud = fakeCloud();
    const a = phone(cloud);
    await a.storage.set('fitness.profile', '{"profile":{"dateOfBirth":"1990-01-01"}}');
    await a.storage.set('fitness.workout-logs', '{"logs":[1]}');
    expect(await a.sync.enable()).toBe('enabled');
    expect([...cloud.rows.keys()].sort()).toEqual(['fitness.profile', 'fitness.workout-logs']);
    expect(a.sync.status()).toBe('idle');

    // Phone B already has backup on for this account (e.g. restored earlier).
    const b = phone(cloud);
    expect(await b.sync.enable('cloud')).toBe('enabled');
    expect(b.restart).toHaveBeenCalled();
    expect(await b.memory.get('fitness.workout-logs')).toBe('{"logs":[1]}');

    await new Promise((r) => setTimeout(r, 5));
    await b.storage.set('fitness.workout-logs', '{"logs":[1,2]}');
    await b.sync.sync();
    await a.sync.sync();
    expect(await a.memory.get('fitness.workout-logs')).toBe('{"logs":[1,2]}');
  });

  it('the cloud already has a backup and this phone has data: the person chooses', async () => {
    const cloud = fakeCloud();
    const a = phone(cloud);
    await a.storage.set('fitness.water-log', '"cloud"');
    await a.sync.enable();
    const b = phone(cloud);
    await b.storage.set('fitness.water-log', '"phone"');
    await b.storage.set('fitness.food', '"only on b"');
    expect(await b.sync.enable()).toBe('needs-choice');
    expect(cloud.rows.get('fitness.water-log')!.value).toBe('"cloud"');
    expect(await b.sync.enable('phone')).toBe('enabled');
    expect(cloud.rows.get('fitness.water-log')!.value).toBe('"phone"');
    expect(cloud.rows.get('fitness.food')!.value).toBe('"only on b"');
  });

  it('keeping this phone\'s data deletes what only the cloud had', async () => {
    const cloud = fakeCloud();
    const a = phone(cloud);
    await a.storage.set('fitness.identity', '"photo"');
    await a.sync.enable();
    const b = phone(cloud);
    await b.storage.set('fitness.water-log', '"b"');
    await new Promise((r) => setTimeout(r, 5));
    expect(await b.sync.enable('phone')).toBe('enabled');
    expect(cloud.rows.get('fitness.identity')!.value).toBeNull();
  });

  it('a new phone signing in to an account with a backup restores it and restarts', async () => {
    const cloud = fakeCloud();
    const a = phone(cloud);
    await a.storage.set('fitness.profile', '{"profile":{}}');
    await a.storage.set('fitness.nutrition-entries', '[1]');
    await a.sync.enable();

    const b = phone(cloud, null);
    await b.sync.start();
    b.auth.signIn('u1');
    await flush();
    expect(await b.memory.get('fitness.profile')).toBe('{"profile":{}}');
    expect(await b.memory.get('fitness.nutrition-entries')).toBe('[1]');
    expect(b.restart).toHaveBeenCalledTimes(1);
    expect(b.sync.enabled()).toBe(true);
  });

  it('turning backup off deletes the cloud copy and keeps the phone\'s data', async () => {
    const cloud = fakeCloud();
    const a = phone(cloud);
    await a.storage.set('fitness.water-log', '{}');
    await a.sync.enable();
    expect(await a.sync.disable()).toBe(true);
    expect(cloud.rows.size).toBe(0);
    expect(await a.memory.get('fitness.water-log')).toBe('{}');
    expect(a.sync.enabled()).toBe(false);
  });

  it('a server refusal for age turns backup off and says so', async () => {
    const cloud = fakeCloud();
    cloud.refuseUnderAge();
    const a = phone(cloud);
    await a.storage.set('fitness.profile', '{"profile":{"dateOfBirth":"2012-01-01"}}');
    expect(await a.sync.enable()).toBe('under-age');
    expect(a.sync.enabled()).toBe(false);
    expect(a.sync.status()).toBe('under-age');
  });

  it('does nothing while backup is off', async () => {
    const cloud = fakeCloud();
    const a = phone(cloud);
    await a.storage.set('fitness.water-log', '{}');
    await a.sync.sync();
    expect(cloud.calls).toEqual([]);
  });
});
