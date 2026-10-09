import { TestBed } from '@angular/core/testing';

import { FitnessAssessmentService } from '../calculations/fitness-assessment.service';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { FoodEntry, FoodEntryInput, createFoodEntry } from '../../domain/nutrition';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { CLOCK } from '../time/clock';
import { LocalNutritionRepository, NutritionRepository, NutritionStorageError } from './nutrition.repository';
import { NutritionService } from './nutrition.service';

const KEY = 'fitness.nutrition-entries';
const PROFILE: UserFitnessProfile = {
  primaryGoal: 'build-muscle',
  dateOfBirth: '1990-06-15',
  sex: 'female',
  height: { centimeters: 168 },
  weight: { kilograms: 64 },
  unitSystem: 'metric',
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  trainingLocation: 'gym',
  equipment: ['full-gym'],
  activityLevel: 'moderately-active',
  goalTarget: { targetWeight: null },
  updatedAt: '2026-10-01T09:00:00.000Z',
};
const INPUT: FoodEntryInput = { name: 'Oats', quantity: 60, unit: 'g', meal: 'breakfast', calories: 230, proteinGrams: 8, carbohydrateGrams: 40, fatGrams: 4 };
const make = (id: string, date: string, overrides: Partial<FoodEntryInput> = {}): FoodEntry => {
  const r = createFoodEntry({ ...INPUT, ...overrides }, { id, date, now: `${date}T08:00:00.000Z` });
  if (!r.ok) {
    throw new Error('bad fixture');
  }
  return r.value;
};

describe('LocalNutritionRepository', () => {
  let storage: MemoryKeyValueStorage;
  let repo: LocalNutritionRepository;
  beforeEach(() => {
    storage = new MemoryKeyValueStorage();
    repo = new LocalNutritionRepository(storage);
  });

  it('adds, edits and deletes entries in a versioned envelope', async () => {
    await repo.add(make('a', '2026-10-08'));
    await repo.add(make('b', '2026-10-08', { name: 'Milk' }));
    await repo.update({ ...make('a', '2026-10-08'), name: 'Rolled oats' });
    await repo.remove('b');
    expect(JSON.parse(storage.values.get(KEY)!)).toMatchObject({ version: 1, entries: [{ id: 'a', name: 'Rolled oats' }] });
    expect((await repo.loadDay('2026-10-08')).map((e) => e.name)).toEqual(['Rolled oats']);
  });

  it('filters by local date and loads inclusive ranges', async () => {
    for (const [id, date] of [['a', '2026-10-06'], ['b', '2026-10-07'], ['c', '2026-10-08'], ['d', '2026-10-09']]) {
      await repo.add(make(id, date));
    }
    expect((await repo.loadDay('2026-10-07')).map((e) => e.id)).toEqual(['b']);
    expect((await repo.loadRange('2026-10-07', '2026-10-08')).map((e) => e.id)).toEqual(['b', 'c']);
  });

  it('corrupt JSON reads as empty', async () => {
    storage.values.set(KEY, '{broken');
    expect(await repo.loadDay('2026-10-08')).toEqual([]);
  });

  it('keeps unreadable stored items untouched when writing (no silent loss)', async () => {
    storage.values.set(KEY, JSON.stringify({ version: 1, entries: [{ id: 'weird', name: 42 }, make('a', '2026-10-08')] }));
    expect((await repo.loadDay('2026-10-08')).map((e) => e.id)).toEqual(['a']);
    await repo.add(make('b', '2026-10-08'));
    expect(JSON.parse(storage.values.get(KEY)!).entries.map((e: { id: string }) => e.id)).toEqual(['weird', 'a', 'b']);
  });

  it('an unknown (newer) storage version is never overwritten', async () => {
    const future = JSON.stringify({ version: 9, entries: [{ id: 'x' }] });
    storage.values.set(KEY, future);
    await expect(repo.loadDay('2026-10-08')).rejects.toBeInstanceOf(NutritionStorageError);
    await expect(repo.add(make('a', '2026-10-08'))).rejects.toMatchObject({ reason: 'unsupported-version' });
    expect(storage.values.get(KEY)).toBe(future);
  });

  it('reports failed writes and missing entries', async () => {
    storage.failWrites = true;
    await expect(repo.add(make('a', '2026-10-08'))).rejects.toMatchObject({ reason: 'write-failed' });
    storage.failWrites = false;
    await expect(repo.update(make('missing', '2026-10-08'))).rejects.toMatchObject({ reason: 'not-found' });
  });
});

describe('NutritionService', () => {
  let storage: MemoryKeyValueStorage;
  let now: Date;

  function setup(profile: UserFitnessProfile | null = PROFILE) {
    storage = new MemoryKeyValueStorage();
    if (profile) {
      storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile }));
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: KeyValueStorage, useValue: storage },
        { provide: CLOCK, useValue: () => now },
      ],
    });
    return TestBed.inject(NutritionService);
  }
  const ready = (service: NutritionService) => {
    const s = service.state();
    if (s.status !== 'ready') {
      throw new Error(s.status);
    }
    return s;
  };

  beforeEach(() => {
    now = new Date(2026, 9, 8, 12, 0); // Thursday 8 Oct 2026, local noon
  });

  describe('targets', () => {
    it('come from the calculation engine for the current profile', async () => {
      const service = setup();
      await service.load();
      const s = ready(service);
      const current = await TestBed.inject(FitnessAssessmentService).current();
      expect(current.kind).toBe('ready');
      expect(s.targets).toMatchObject({ kind: 'available', targets: { calories: { kind: 'target' } } });
      if (current.kind === 'ready' && s.targets.kind === 'available' && s.targets.targets.calories.kind === 'target') {
        expect(s.targets.targets.calories.kcal).toBe(current.assessment.targets.calories.finalKcal);
      }
      expect(s.date).toBe('2026-10-08');
    });

    it('profile missing → no targets, but food logging still works', async () => {
      const service = setup(null);
      await service.load();
      expect(ready(service).targets).toEqual({ kind: 'no-profile' });
      expect((await service.add(INPUT, '2026-10-08')).ok).toBe(true);
    });

    it('calculation unavailable is reported, not invented', async () => {
      const service = setup();
      vi.spyOn(TestBed.inject(FitnessAssessmentService), 'current').mockResolvedValue({ kind: 'unavailable' });
      await service.load();
      expect(ready(service).targets).toEqual({ kind: 'unavailable' });
    });

    it('review-required and infeasible results withhold the affected targets', async () => {
      const service = setup();
      const assessments = TestBed.inject(FitnessAssessmentService);
      const real = await assessments.current();
      if (real.kind !== 'ready') {
        throw new Error('fixture');
      }
      const a = real.assessment;
      vi.spyOn(assessments, 'current').mockResolvedValueOnce({
        ...real,
        assessment: { ...a, targets: { ...a.targets, calories: { ...a.targets.calories, status: 'review-required' } } },
      });
      await service.load();
      expect(ready(service).targets).toEqual({
        kind: 'available',
        targets: { calories: { kind: 'review-required' }, macros: { kind: 'withheld', reason: 'calorie-review' } },
      });

      vi.spyOn(assessments, 'current').mockResolvedValueOnce({
        ...real,
        assessment: { ...a, targets: { ...a.targets, macros: { status: 'infeasible', reason: 'protein-and-minimum-fat-exceed-calories', analysis: a.targets.macros.analysis } } },
      });
      await service.refreshTargets();
      expect(ready(service).targets).toMatchObject({ targets: { calories: { kind: 'target' }, macros: { kind: 'withheld', reason: 'infeasible' } } });
    });

    it('refreshing targets never rewrites food logs', async () => {
      const service = setup();
      await service.load();
      await service.add(INPUT, '2026-10-08');
      const before = storage.values.get(KEY);
      const set = vi.spyOn(storage, 'set');
      await service.refreshTargets();
      expect(set).not.toHaveBeenCalled();
      expect(storage.values.get(KEY)).toBe(before);
      expect(ready(service).day.entries).toHaveLength(1);
    });
  });

  describe('food logs', () => {
    it('add, edit and delete keep totals derived from entries', async () => {
      const service = setup();
      await service.load();
      const added = await service.add(INPUT, '2026-10-08');
      await service.add({ ...INPUT, name: 'Chicken', meal: 'dinner', calories: 330.5, proteinGrams: 62.1, carbohydrateGrams: 0, fatGrams: 7.2 }, '2026-10-08');
      expect(ready(service).day.totals).toEqual({ calories: 560.5, proteinGrams: 70.1, carbohydrateGrams: 40, fatGrams: 11.2 });

      if (!added.ok) {
        throw new Error('add failed');
      }
      const edited = await service.update(added.entry, { ...INPUT, calories: 300 });
      expect(edited.ok && edited.entry).toMatchObject({ id: added.entry.id, createdAt: added.entry.createdAt, nutrition: { calories: 300 } });
      expect(ready(service).day.totals.calories).toBe(630.5);

      expect(await service.remove(added.entry)).toEqual({ ok: true });
      expect(ready(service).day.totals.calories).toBe(330.5);
      expect(ready(service).day.meals.find((m) => m.meal === 'breakfast')?.entries).toEqual([]);
    });

    it('invalid input is returned with field errors and nothing is saved', async () => {
      const service = setup();
      await service.load();
      expect(await service.add({ ...INPUT, name: '', quantity: 0 }, '2026-10-08')).toEqual({
        ok: false,
        kind: 'invalid',
        errors: { name: 'required', quantity: 'not-positive' },
      });
      expect(storage.values.has(KEY)).toBe(false);
    });

    it('a failed save is reported and not shown as saved', async () => {
      const service = setup();
      await service.load();
      storage.failWrites = true;
      expect(await service.add(INPUT, '2026-10-08')).toEqual({ ok: false, kind: 'save-failed' });
      expect(ready(service).day.entries).toEqual([]);

      storage.failWrites = false;
      const saved = await service.add(INPUT, '2026-10-08');
      storage.failWrites = true;
      if (!saved.ok) {
        throw new Error('fixture');
      }
      expect(await service.remove(saved.entry)).toEqual({ ok: false });
      expect(ready(service).day.entries).toHaveLength(1); // not pretended gone
      expect((await service.update(saved.entry, { ...INPUT, calories: 1 })).ok).toBe(false);
      expect(ready(service).day.entries[0].nutrition.calories).toBe(230);
    });

    it('persists across app sessions', async () => {
      const service = setup();
      await service.load();
      await service.add(INPUT, '2026-10-08');
      const stored = storage.values.get(KEY);

      TestBed.resetTestingModule();
      storage = new MemoryKeyValueStorage();
      storage.values.set(KEY, stored!);
      TestBed.configureTestingModule({ providers: [{ provide: KeyValueStorage, useValue: storage }, { provide: CLOCK, useValue: () => now }] });
      const again = TestBed.inject(NutritionService);
      await again.load();
      expect(ready(again).day.entries.map((e) => e.name)).toEqual(['Oats']);
    });

    it('serializes concurrent changes: none lost', async () => {
      const service = setup();
      await service.load();
      await Promise.all(['A', 'B', 'C', 'D'].map((name) => service.add({ ...INPUT, name }, '2026-10-08')));
      expect(ready(service).day.entries.map((e) => e.name).sort()).toEqual(['A', 'B', 'C', 'D']);
      expect(JSON.parse(storage.values.get(KEY)!).entries).toHaveLength(4);
    });

    it('a storage read failure is an error state', async () => {
      const service = setup();
      vi.spyOn(TestBed.inject(NutritionRepository), 'loadDay').mockRejectedValueOnce(new NutritionStorageError('unsupported-version'));
      await service.load();
      expect(service.state()).toEqual({ status: 'error', date: '2026-10-08' });
      await service.load();
      expect(service.state().status).toBe('ready');
    });
  });

  describe('selected day', () => {
    it('moves between days, never into the future, and returns to today', async () => {
      const service = setup();
      await service.add(INPUT, '2026-10-07');
      await service.load();
      expect(service.isToday()).toBe(true);
      await service.goToNextDay();
      expect(service.selectedDate()).toBe('2026-10-08');

      await service.goToPreviousDay();
      expect(service.selectedDate()).toBe('2026-10-07');
      expect(service.isToday()).toBe(false);
      expect(ready(service).day.entries.map((e) => e.name)).toEqual(['Oats']);

      await service.goToPreviousDay();
      expect(service.selectedDate()).toBe('2026-10-06');
      await service.goToToday();
      expect(service.selectedDate()).toBe('2026-10-08');
      await service.load('2026-12-25');
      expect(service.selectedDate()).toBe('2026-10-08');
    });

    it('changes made to another day do not leak into the shown day', async () => {
      const service = setup();
      await service.load('2026-10-07');
      await service.add(INPUT, '2026-10-08');
      expect(ready(service).day.entries).toEqual([]);
    });

    it('the latest load wins over a slower earlier one', async () => {
      const service = setup();
      const repo = TestBed.inject(NutritionRepository);
      const real = repo.loadDay.bind(repo);
      let release!: () => void;
      vi.spyOn(repo, 'loadDay').mockImplementationOnce(async (date) => {
        await new Promise<void>((r) => (release = r));
        return real(date);
      });
      const slow = service.load('2026-10-06');
      await service.load('2026-10-07');
      release();
      await slow;
      expect(service.selectedDate()).toBe('2026-10-07');
    });

    it('uses the local calendar date near midnight', async () => {
      now = new Date(2026, 9, 8, 23, 59);
      const service = setup();
      await service.load();
      expect(service.selectedDate()).toBe('2026-10-08');
      now = new Date(2026, 9, 9, 0, 1);
      expect(service.today()).toBe('2026-10-09');
    });
  });
});
