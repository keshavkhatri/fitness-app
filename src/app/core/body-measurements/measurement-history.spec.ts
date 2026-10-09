import { TestBed } from '@angular/core/testing';

import { MeasurementEntry, MeasurementEntryInput } from '../../domain/body-measurements';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { CLOCK } from '../time/clock';
import {
  LocalMeasurementHistoryRepository,
  MeasurementHistoryRepository,
  MeasurementHistoryStorageError,
} from './measurement-history.repository';
import { MEASUREMENT_ENTRY_ID, MeasurementHistoryService } from './measurement-history.service';

const KEY = 'fitness.body-measurement-entries';
const WEIGHT_KEY = 'fitness.body-weight-entries';
const PROFILE_KEY = 'fitness.profile';
const PROFILE: UserFitnessProfile = {
  primaryGoal: 'lose-fat',
  dateOfBirth: '1990-06-15',
  sex: 'male',
  height: { centimeters: 180 },
  weight: { kilograms: 82 },
  unitSystem: 'metric',
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  trainingLocation: 'gym',
  equipment: ['full-gym'],
  activityLevel: 'moderately-active',
  goalTarget: { targetWeight: null },
  updatedAt: '2026-10-01T09:00:00.000Z',
};
const entry = (id: string, date: string, waist: number): MeasurementEntry => ({
  id,
  date,
  values: { waist: { centimeters: waist } },
  createdAt: `${date}T07:00:00.000Z`,
  updatedAt: `${date}T07:00:00.000Z`,
});
const cm = (waist: number | null, date = '2026-10-08'): MeasurementEntryInput => ({ values: { waist }, unitSystem: 'metric', date });
const storedIds = (storage: MemoryKeyValueStorage) => JSON.parse(storage.values.get(KEY)!).entries.map((e: { id: string }) => e.id);

describe('LocalMeasurementHistoryRepository', () => {
  let storage: MemoryKeyValueStorage;
  let repo: LocalMeasurementHistoryRepository;
  beforeEach(() => {
    storage = new MemoryKeyValueStorage();
    repo = new LocalMeasurementHistoryRepository(storage);
  });

  it('nothing stored is an empty history', async () => {
    expect(await repo.list()).toEqual([]);
  });

  it('adds, edits and deletes in a versioned envelope under its own key, listed oldest first', async () => {
    await repo.add(entry('b', '2026-10-07', 80));
    await repo.add(entry('a', '2026-10-05', 81));
    await repo.add(entry('c', '2026-10-08', 79.5));
    await repo.update({ ...entry('b', '2026-10-07', 80.2), updatedAt: '2026-10-09T08:00:00.000Z' });
    await repo.remove('c');
    await repo.remove('missing');
    expect(JSON.parse(storage.values.get(KEY)!)).toMatchObject({ version: 1 });
    expect([...storage.values.keys()]).toEqual([KEY]);
    expect((await repo.list()).map((e) => [e.id, e.values.waist?.centimeters])).toEqual([
      ['a', 81],
      ['b', 80.2],
    ]);
  });

  it('refuses duplicate ids and edits of unknown entries', async () => {
    await repo.add(entry('a', '2026-10-05', 81));
    await expect(repo.add(entry('a', '2026-10-06', 70))).rejects.toMatchObject({ reason: 'duplicate-id' });
    await expect(repo.update(entry('nope', '2026-10-06', 70))).rejects.toMatchObject({ reason: 'not-found' });
    expect((await repo.list()).map((e) => e.values.waist?.centimeters)).toEqual([81]);
  });

  it('keeps unreadable stored items, including unknown sites, unchanged on every write', async () => {
    const newerSite = { ...entry('n', '2026-10-04', 80), values: { waist: { centimeters: 80 }, neck: { centimeters: 38 } } };
    const broken = { id: 'odd', values: 'big' };
    storage.values.set(KEY, JSON.stringify({ version: 1, entries: [broken, newerSite, entry('a', '2026-10-05', 81)] }));
    expect((await repo.list()).map((e) => e.id)).toEqual(['a']);

    await repo.add(entry('b', '2026-10-06', 80));
    await repo.update({ ...entry('a', '2026-10-05', 82), updatedAt: '2026-10-09T08:00:00.000Z' });
    await repo.remove('b');
    const stored = JSON.parse(storage.values.get(KEY)!).entries;
    expect(stored.slice(0, 2)).toEqual([broken, newerSite]);
    expect(stored.map((e: { id: string }) => e.id)).toEqual(['odd', 'n', 'a']);
  });

  it('never edits, deletes or reuses the id of an unreadable item', async () => {
    const newerSite = { ...entry('n', '2026-10-04', 80), values: { neck: { centimeters: 38 } } };
    storage.values.set(KEY, JSON.stringify({ version: 1, entries: [newerSite] }));
    await expect(repo.update(entry('n', '2026-10-04', 70))).rejects.toMatchObject({ reason: 'not-found' });
    await expect(repo.add(entry('n', '2026-10-04', 70))).rejects.toMatchObject({ reason: 'duplicate-id' });
    await repo.remove('n');
    expect(JSON.parse(storage.values.get(KEY)!).entries).toEqual([newerSite]);
  });

  it('reports stored-but-unreadable ids without writing', async () => {
    const newerSite = { ...entry('n', '2026-10-04', 80), values: { neck: { centimeters: 38 } } };
    const raw = JSON.stringify({ version: 1, entries: [newerSite, entry('a', '2026-10-05', 81)] });
    storage.values.set(KEY, raw);
    expect(await repo.hasUnreadable('n')).toBe(true);
    expect(await repo.hasUnreadable('a')).toBe(false);
    expect(await repo.hasUnreadable('missing')).toBe(false);
    expect(storage.values.get(KEY)).toBe(raw);
    storage.values.set(KEY, '{oops');
    await expect(repo.hasUnreadable('n')).rejects.toBeInstanceOf(MeasurementHistoryStorageError);
  });

  it('counts stored-but-unreadable items without writing', async () => {
    expect(await repo.countUnreadable()).toBe(0);
    const newerSite = { ...entry('n', '2026-10-04', 80), values: { neck: { centimeters: 38 } } };
    const raw = JSON.stringify({ version: 1, entries: [newerSite, entry('a', '2026-10-05', 81), { id: 'broken' }] });
    storage.values.set(KEY, raw);
    expect(await repo.countUnreadable()).toBe(2);
    expect(storage.values.get(KEY)).toBe(raw);
    storage.values.set(KEY, '{oops');
    await expect(repo.countUnreadable()).rejects.toBeInstanceOf(MeasurementHistoryStorageError);
    expect(storage.values.get(KEY)).toBe('{oops');
  });

  it.each([
    ['corrupt JSON', '{oops'],
    ['a non-object', '[1,2]'],
    ['a missing entries array', JSON.stringify({ version: 1 })],
    ['a newer version', JSON.stringify({ version: 2, entries: [{ id: 'x' }] })],
    ['a newer version without entries', JSON.stringify({ version: 2, records: [{ id: 'x' }] })],
  ])('%s is an error and is never overwritten', async (_, stored) => {
    storage.values.set(KEY, stored);
    await expect(repo.list()).rejects.toBeInstanceOf(MeasurementHistoryStorageError);
    await expect(repo.add(entry('a', '2026-10-05', 81))).rejects.toBeInstanceOf(MeasurementHistoryStorageError);
    await expect(repo.update(entry('x', '2026-10-05', 81))).rejects.toBeInstanceOf(MeasurementHistoryStorageError);
    await expect(repo.remove('x')).rejects.toBeInstanceOf(MeasurementHistoryStorageError);
    expect(storage.values.get(KEY)).toBe(stored);
  });

  it('a failed write is reported', async () => {
    storage.failWrites = true;
    await expect(repo.add(entry('a', '2026-10-05', 81))).rejects.toMatchObject({ reason: 'write-failed' });
    expect(storage.values.has(KEY)).toBe(false);
  });
});

describe('MeasurementHistoryService', () => {
  let storage: MemoryKeyValueStorage;
  let now: Date;
  let ids: number;

  function setup(profile: UserFitnessProfile | null = PROFILE, newId: () => string = () => `m${++ids}`) {
    storage = new MemoryKeyValueStorage();
    if (profile) {
      storage.values.set(PROFILE_KEY, JSON.stringify({ version: 2, profile }));
    }
    ids = 0;
    TestBed.configureTestingModule({
      providers: [
        { provide: KeyValueStorage, useValue: storage },
        { provide: CLOCK, useValue: () => now },
        { provide: MEASUREMENT_ENTRY_ID, useValue: newId },
      ],
    });
    return TestBed.inject(MeasurementHistoryService);
  }
  const ready = (service: MeasurementHistoryService) => {
    const s = service.state();
    if (s.status !== 'ready') {
      throw new Error(s.status);
    }
    return s;
  };

  beforeEach(() => {
    now = new Date(2026, 9, 9, 8, 0); // Friday 9 Oct 2026, local
  });

  it('loads the history with the profile’s unit system (metric without a profile)', async () => {
    const service = setup({ ...PROFILE, unitSystem: 'imperial' });
    await service.load();
    expect(ready(service)).toEqual({ status: 'ready', entries: [], unitSystem: 'imperial' });

    TestBed.resetTestingModule();
    const noProfile = setup(null);
    await noProfile.load();
    expect(ready(noProfile).unitSystem).toBe('metric');
  });

  it('stores centimeters whatever the input unit; edits keep id and creation time', async () => {
    const service = setup({ ...PROFILE, unitSystem: 'imperial' });
    await service.load();
    const added = await service.add({ values: { waist: 32.3, arm: 13 }, unitSystem: 'imperial', date: '2026-10-08' });
    const createdAt = now.toISOString();
    expect(added).toEqual({
      ok: true,
      entry: { id: 'm1', date: '2026-10-08', values: { waist: { centimeters: 82.04 }, arm: { centimeters: 33.02 } }, createdAt, updatedAt: createdAt },
    });
    expect(JSON.parse(storage.values.get(KEY)!).entries[0].values).toEqual({ waist: { centimeters: 82.04 }, arm: { centimeters: 33.02 } });
    if (!added.ok) {
      throw new Error('fixture');
    }
    now = new Date(2026, 9, 9, 9, 30);
    const edited = await service.update(added.entry, cm(81.2, '2026-10-07'));
    expect(edited).toEqual({
      ok: true,
      entry: { id: 'm1', date: '2026-10-07', values: { waist: { centimeters: 81.2 } }, createdAt, updatedAt: now.toISOString() },
    });
    expect(ready(service).entries).toEqual([(edited as { entry: MeasurementEntry }).entry]);
  });

  it('keeps the shown list ordered by measurement date', async () => {
    const service = setup();
    await service.load();
    await service.add(cm(80, '2026-10-08'));
    await service.add(cm(81, '2026-10-02'));
    await service.add(cm(80.5, '2026-10-05'));
    expect(ready(service).entries.map((e) => e.date)).toEqual(['2026-10-02', '2026-10-05', '2026-10-08']);
  });

  it('invalid input is returned with field errors and nothing is stored', async () => {
    const service = setup();
    await service.load();
    expect(await service.add(cm(5, '2026-10-12'))).toEqual({ ok: false, kind: 'invalid', errors: { waist: 'out-of-range', date: 'future-date' } });
    expect(await service.add({ values: {}, unitSystem: 'metric', date: '2026-10-08' })).toEqual({
      ok: false,
      kind: 'invalid',
      errors: { values: 'required' },
    });
    expect(storage.values.has(KEY)).toBe(false);
  });

  it('failed saves and deletes are reported and not shown as done', async () => {
    const service = setup();
    await service.load();
    storage.failWrites = true;
    expect(await service.add(cm(80))).toEqual({ ok: false, kind: 'save-failed' });
    expect(ready(service).entries).toEqual([]);

    storage.failWrites = false;
    const saved = await service.add(cm(80));
    if (!saved.ok) {
      throw new Error('fixture');
    }
    storage.failWrites = true;
    expect(await service.update(saved.entry, cm(79))).toEqual({ ok: false, kind: 'save-failed' });
    expect(await service.remove(saved.entry)).toEqual({ ok: false });
    expect(ready(service).entries.map((e) => e.values.waist?.centimeters)).toEqual([80]);
  });

  it('runs queued writes in call order; a failure mid-queue is reported and later writes still apply', async () => {
    const service = setup();
    await service.load();
    const order: string[] = [];
    const set = storage.set.bind(storage);
    let call = 0;
    vi.spyOn(storage, 'set').mockImplementation(async (key, value) => {
      const n = ++call;
      // Earlier writes are slower, so any overlap would reorder them.
      await new Promise((resolve) => setTimeout(resolve, 10 - n * 2));
      order.push(`write${n}`);
      if (n === 2) {
        throw new Error('disk full');
      }
      return set(key, value);
    });
    const results = await Promise.all([cm(80, '2026-10-01'), cm(81, '2026-10-02'), cm(82, '2026-10-03')].map((i) => service.add(i)));
    expect(order).toEqual(['write1', 'write2', 'write3']);
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(storedIds(storage)).toEqual(['m1', 'm3']);
    expect(ready(service).entries.map((e) => e.id)).toEqual(['m1', 'm3']);
  });

  it('a duplicate generated id is refused, never overwriting the existing entry', async () => {
    const service = setup(PROFILE, () => 'same');
    await service.load();
    await service.add(cm(80));
    expect(await service.add(cm(70))).toEqual({ ok: false, kind: 'save-failed' });
    expect(ready(service).entries.map((e) => e.values.waist?.centimeters)).toEqual([80]);
  });

  it('an unreadable history is an error state, writes fail without touching it; retrying recovers', async () => {
    const service = setup();
    storage.values.set(KEY, '{oops');
    await service.load();
    expect(service.state()).toEqual({ status: 'error' });
    expect(await service.add(cm(80))).toEqual({ ok: false, kind: 'save-failed' });
    expect(storage.values.get(KEY)).toBe('{oops');

    vi.spyOn(TestBed.inject(MeasurementHistoryRepository), 'list').mockResolvedValueOnce([]);
    await service.load();
    expect(service.state().status).toBe('ready');
  });

  it('never changes the profile or weight history', async () => {
    const service = setup();
    const weights = JSON.stringify({ version: 1, entries: [{ id: 'w1', date: '2026-10-01', weight: { kilograms: 82 } }] });
    storage.values.set(WEIGHT_KEY, weights);
    const profiles = TestBed.inject(FitnessProfileService);
    const save = vi.spyOn(profiles, 'save');
    const profileBefore = storage.values.get(PROFILE_KEY);
    await service.load();
    const added = await service.add(cm(75));
    if (added.ok) {
      await service.update(added.entry, cm(74));
      await service.remove(added.entry);
    }
    expect(save).not.toHaveBeenCalled();
    expect(storage.values.get(PROFILE_KEY)).toBe(profileBefore);
    expect(storage.values.get(WEIGHT_KEY)).toBe(weights);
    expect([...storage.values.keys()].sort()).toEqual([KEY, WEIGHT_KEY, PROFILE_KEY].sort());
  });
});
