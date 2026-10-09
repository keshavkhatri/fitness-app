import { TestBed } from '@angular/core/testing';

import { WeightEntry, WeightEntryInput } from '../../domain/body-measurements';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { CLOCK } from '../time/clock';
import { WorkoutPlanService } from '../workout/workout-plan.service';
import { LocalWeightHistoryRepository, WeightHistoryRepository, WeightHistoryStorageError } from './weight-history.repository';
import { WEIGHT_ENTRY_ID, WeightHistoryService } from './weight-history.service';

const KEY = 'fitness.body-weight-entries';
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
const entry = (id: string, date: string, kilograms: number): WeightEntry => ({
  id,
  date,
  weight: { kilograms },
  createdAt: `${date}T07:00:00.000Z`,
  updatedAt: `${date}T07:00:00.000Z`,
});
const kg = (weight: number | null, date = '2026-10-08'): WeightEntryInput => ({ weight, unitSystem: 'metric', date });

describe('LocalWeightHistoryRepository', () => {
  let storage: MemoryKeyValueStorage;
  let repo: LocalWeightHistoryRepository;
  beforeEach(() => {
    storage = new MemoryKeyValueStorage();
    repo = new LocalWeightHistoryRepository(storage);
  });

  it('nothing stored is an empty history', async () => {
    expect(await repo.list()).toEqual([]);
  });

  it('adds, edits and deletes in a versioned envelope, listed oldest first', async () => {
    await repo.add(entry('b', '2026-10-07', 80));
    await repo.add(entry('a', '2026-10-05', 81));
    await repo.add(entry('c', '2026-10-08', 79.5));
    await repo.update({ ...entry('b', '2026-10-07', 80.2), updatedAt: '2026-10-09T08:00:00.000Z' });
    await repo.remove('c');
    expect(JSON.parse(storage.values.get(KEY)!)).toMatchObject({ version: 1 });
    expect((await repo.list()).map((e) => [e.id, e.weight.kilograms])).toEqual([
      ['a', 81],
      ['b', 80.2],
    ]);
  });

  it('deleting removes only the requested entry', async () => {
    for (const e of [entry('a', '2026-10-05', 81), entry('b', '2026-10-06', 80), entry('c', '2026-10-07', 79)]) {
      await repo.add(e);
    }
    await repo.remove('b');
    await repo.remove('missing');
    expect((await repo.list()).map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('refuses duplicate ids and edits of unknown entries', async () => {
    await repo.add(entry('a', '2026-10-05', 81));
    await expect(repo.add(entry('a', '2026-10-06', 70))).rejects.toMatchObject({ reason: 'duplicate-id' });
    await expect(repo.update(entry('nope', '2026-10-06', 70))).rejects.toMatchObject({ reason: 'not-found' });
    expect((await repo.list()).map((e) => e.weight.kilograms)).toEqual([81]);
  });

  it('corrupt JSON or a missing array reads as empty', async () => {
    storage.values.set(KEY, '{oops');
    expect(await repo.list()).toEqual([]);
    storage.values.set(KEY, JSON.stringify({ version: 1 }));
    expect(await repo.list()).toEqual([]);
  });

  it('keeps unreadable stored items on the next write (no silent loss)', async () => {
    storage.values.set(KEY, JSON.stringify({ version: 1, entries: [{ id: 'odd', weight: 'heavy' }, entry('a', '2026-10-05', 81)] }));
    expect((await repo.list()).map((e) => e.id)).toEqual(['a']);
    await repo.add(entry('b', '2026-10-06', 80));
    expect(JSON.parse(storage.values.get(KEY)!).entries.map((e: { id: string }) => e.id)).toEqual(['odd', 'a', 'b']);
  });

  it('an unknown (newer) version is an error and is never overwritten', async () => {
    const future = JSON.stringify({ version: 2, entries: [{ id: 'x' }] });
    storage.values.set(KEY, future);
    await expect(repo.list()).rejects.toBeInstanceOf(WeightHistoryStorageError);
    await expect(repo.add(entry('a', '2026-10-05', 81))).rejects.toMatchObject({ reason: 'unsupported-version' });
    await expect(repo.remove('x')).rejects.toMatchObject({ reason: 'unsupported-version' });
    expect(storage.values.get(KEY)).toBe(future);
  });

  it('a failed write is reported', async () => {
    storage.failWrites = true;
    await expect(repo.add(entry('a', '2026-10-05', 81))).rejects.toMatchObject({ reason: 'write-failed' });
  });
});

describe('WeightHistoryService', () => {
  let storage: MemoryKeyValueStorage;
  let now: Date;
  let ids: number;

  function setup(profile: UserFitnessProfile | null = PROFILE, newId: () => string = () => `w${++ids}`) {
    storage = new MemoryKeyValueStorage();
    if (profile) {
      storage.values.set(PROFILE_KEY, JSON.stringify({ version: 2, profile }));
    }
    ids = 0;
    TestBed.configureTestingModule({
      providers: [
        { provide: KeyValueStorage, useValue: storage },
        { provide: CLOCK, useValue: () => now },
        { provide: WEIGHT_ENTRY_ID, useValue: newId },
      ],
    });
    return TestBed.inject(WeightHistoryService);
  }
  const ready = (service: WeightHistoryService) => {
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

  it('adds with injected ids and timestamps; edits keep id and creation time', async () => {
    const service = setup();
    await service.load();
    const added = await service.add({ weight: 180, unitSystem: 'imperial', date: '2026-10-08' });
    expect(added).toEqual({
      ok: true,
      entry: { id: 'w1', date: '2026-10-08', weight: { kilograms: 81.65 }, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    });
    if (!added.ok) {
      throw new Error('fixture');
    }
    const createdAt = now.toISOString();
    now = new Date(2026, 9, 9, 9, 30);
    const edited = await service.update(added.entry, kg(81.2, '2026-10-07'));
    expect(edited).toEqual({
      ok: true,
      entry: { id: 'w1', date: '2026-10-07', weight: { kilograms: 81.2 }, createdAt, updatedAt: now.toISOString() },
    });
    expect(ready(service).entries).toHaveLength(1);
  });

  it('keeps the shown list ordered by measurement date', async () => {
    const service = setup();
    await service.load();
    await service.add(kg(80, '2026-10-08'));
    await service.add(kg(81, '2026-10-02'));
    await service.add(kg(80.5, '2026-10-05'));
    expect(ready(service).entries.map((e) => e.date)).toEqual(['2026-10-02', '2026-10-05', '2026-10-08']);
  });

  it('invalid input is returned with field errors and nothing is stored', async () => {
    const service = setup();
    await service.load();
    expect(await service.add(kg(5, '2026-10-12'))).toEqual({ ok: false, kind: 'invalid', errors: { weight: 'out-of-range', date: 'future-date' } });
    expect(storage.values.has(KEY)).toBe(false);
  });

  it('failed saves and deletes are reported and not shown as done', async () => {
    const service = setup();
    await service.load();
    storage.failWrites = true;
    expect(await service.add(kg(80))).toEqual({ ok: false, kind: 'save-failed' });
    expect(ready(service).entries).toEqual([]);

    storage.failWrites = false;
    const saved = await service.add(kg(80));
    if (!saved.ok) {
      throw new Error('fixture');
    }
    storage.failWrites = true;
    expect((await service.update(saved.entry, kg(79))).ok).toBe(false);
    expect(await service.remove(saved.entry)).toEqual({ ok: false });
    expect(ready(service).entries.map((e) => e.weight.kilograms)).toEqual([80]);
  });

  it('deletes only the chosen entry', async () => {
    const service = setup();
    await service.load();
    await service.add(kg(81, '2026-10-05'));
    const middle = await service.add(kg(80, '2026-10-06'));
    await service.add(kg(79, '2026-10-07'));
    if (!middle.ok) {
      throw new Error('fixture');
    }
    expect(await service.remove(middle.entry)).toEqual({ ok: true });
    expect(ready(service).entries.map((e) => e.weight.kilograms)).toEqual([81, 79]);
  });

  it('serializes concurrent adds: none lost', async () => {
    const service = setup();
    await service.load();
    await Promise.all([80, 80.5, 81, 81.5].map((w, i) => service.add(kg(w, `2026-10-0${i + 1}`))));
    expect(ready(service).entries).toHaveLength(4);
    expect(JSON.parse(storage.values.get(KEY)!).entries).toHaveLength(4);
  });

  it('a duplicate generated id is refused, never overwriting the existing entry', async () => {
    const service = setup(PROFILE, () => 'same');
    await service.load();
    await service.add(kg(80));
    expect(await service.add(kg(70))).toEqual({ ok: false, kind: 'save-failed' });
    expect(ready(service).entries.map((e) => e.weight.kilograms)).toEqual([80]);
  });

  it('an unreadable history is an error state; retrying recovers', async () => {
    const service = setup();
    vi.spyOn(TestBed.inject(WeightHistoryRepository), 'list').mockRejectedValueOnce(new WeightHistoryStorageError('unsupported-version'));
    await service.load();
    expect(service.state()).toEqual({ status: 'error' });
    await service.load();
    expect(service.state().status).toBe('ready');
  });

  it('never changes the profile’s weight, nor regenerates the plan', async () => {
    const service = setup();
    const profiles = TestBed.inject(FitnessProfileService);
    const save = vi.spyOn(profiles, 'save');
    const plans = vi.spyOn(TestBed.inject(WorkoutPlanService), 'load');
    const profileBefore = storage.values.get(PROFILE_KEY);
    await service.load();
    const added = await service.add(kg(75));
    if (added.ok) {
      await service.update(added.entry, kg(74));
      await service.remove(added.entry);
    }
    expect(save).not.toHaveBeenCalled();
    expect(plans).not.toHaveBeenCalled();
    expect(storage.values.get(PROFILE_KEY)).toBe(profileBefore);
    expect((await profiles.load())?.weight).toEqual({ kilograms: 82 });
  });
});
