import { TestBed } from '@angular/core/testing';

import {
  BodyCompositionAssessment,
  BodyCompositionInput,
  ImportProvenance,
  MANUAL_INBODY_SOURCE,
  ParsedReport,
  bodyCompositionInputFromReport,
} from '../../domain/body-composition';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { CLOCK } from '../time/clock';
import {
  BODY_COMPOSITION_SCHEMA_VERSION,
  BODY_COMPOSITION_STORAGE_KEY,
  BodyCompositionHistoryRepository,
  BodyCompositionHistoryStorageError,
  LocalBodyCompositionHistoryRepository,
} from './body-composition-history.repository';
import { BODY_COMPOSITION_ASSESSMENT_ID, BodyCompositionHistoryService } from './body-composition-history.service';

// The documented storage contract: its own key, a version-1 envelope.
const KEY = 'fitness.body-composition-assessments';
const WEIGHT_KEY = 'fitness.body-weight-entries';
const MEASUREMENT_KEY = 'fitness.body-measurement-entries';
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
const PROVENANCE: ImportProvenance = {
  device: 'inbody',
  entryMethod: 'import',
  format: 'inbody-570-result-sheet',
  parser: { name: 'inbody-pdf', version: '0.1.0-test' },
};
const assessment = (id: string, date: string, createdAt = `${date}T07:00:00.000Z`): BodyCompositionAssessment => ({
  id,
  date,
  source: MANUAL_INBODY_SOURCE,
  reported: { 'body-fat-percentage': { value: 22.4, unit: '%' } },
  createdAt,
  updatedAt: createdAt,
});
const imported = (id: string, date: string): BodyCompositionAssessment => ({
  ...assessment(id, date),
  source: PROVENANCE,
  // Values with more precision than any display uses, and a non-metric unit: neither may be converted or rounded.
  reported: { weight: { value: 176.83, unit: 'lb' }, 'body-fat-mass': { value: 39.247, unit: 'lb' }, 'body-fat-percentage': { value: 22.19, unit: '%' } },
});
const manual = (fat: number | null, date = '2026-10-08'): BodyCompositionInput => ({
  date,
  source: MANUAL_INBODY_SOURCE,
  values: { 'body-fat-percentage': fat === null ? null : { value: fat, unit: '%' } },
});
const stored = (storage: MemoryKeyValueStorage) => JSON.parse(storage.values.get(KEY)!);
const storedIds = (storage: MemoryKeyValueStorage) => stored(storage).assessments.map((a: { id: string }) => a.id);

describe('LocalBodyCompositionHistoryRepository', () => {
  let storage: MemoryKeyValueStorage;
  let repo: LocalBodyCompositionHistoryRepository;
  beforeEach(() => {
    storage = new MemoryKeyValueStorage();
    repo = new LocalBodyCompositionHistoryRepository(storage);
  });

  it('uses its own key and a version-1 envelope', () => {
    expect(BODY_COMPOSITION_STORAGE_KEY).toBe(KEY);
    expect(BODY_COMPOSITION_SCHEMA_VERSION).toBe(1);
  });

  it('nothing stored is an empty history', async () => {
    expect(await repo.list()).toEqual([]);
    expect(await repo.countUnreadable()).toBe(0);
    expect(storage.values.size).toBe(0);
  });

  it('saves and reloads assessments in a versioned envelope under its own key', async () => {
    const a = assessment('a', '2026-10-05');
    await repo.add(a);
    expect(stored(storage)).toEqual({ version: 1, assessments: [a] });
    expect([...storage.values.keys()]).toEqual([KEY]);
    expect(await new LocalBodyCompositionHistoryRepository(storage).list()).toEqual([a]);
  });

  it('lists oldest first by date, then creation time, then id, whatever the save order', async () => {
    await repo.add(assessment('late', '2026-10-08'));
    await repo.add(assessment('d', '2026-10-06', '2026-10-06T09:00:00.000Z'));
    await repo.add(assessment('c', '2026-10-06', '2026-10-06T09:00:00.000Z'));
    await repo.add(assessment('b', '2026-10-06', '2026-10-06T06:00:00.000Z'));
    await repo.add(assessment('early', '2026-10-01'));
    expect((await repo.list()).map((a) => a.id)).toEqual(['early', 'b', 'c', 'd', 'late']);
    expect(storedIds(storage)).toEqual(['late', 'd', 'c', 'b', 'early']);
  });

  it('preserves imported values and provenance exactly through save and reload', async () => {
    const a = imported('i1', '2026-10-07');
    await repo.add(a);
    const [reloaded] = await new LocalBodyCompositionHistoryRepository(storage).list();
    expect(reloaded).toEqual(a);
    expect(reloaded.source).toEqual(PROVENANCE);
    expect(reloaded.reported['body-fat-mass']).toEqual({ value: 39.247, unit: 'lb' });
    expect(stored(storage).assessments[0]).toEqual(a);
  });

  it('refuses duplicate ids, including the id of an unreadable item', async () => {
    const newer = { ...assessment('n', '2026-10-04'), notes: 'from a newer version' };
    storage.values.set(KEY, JSON.stringify({ version: 1, assessments: [newer] }));
    await repo.add(assessment('a', '2026-10-05'));
    await expect(repo.add(assessment('a', '2026-10-06'))).rejects.toMatchObject({ reason: 'duplicate-id' });
    await expect(repo.add(assessment('n', '2026-10-06'))).rejects.toMatchObject({ reason: 'duplicate-id' });
    expect(stored(storage).assessments).toEqual([newer, assessment('a', '2026-10-05')]);
  });

  it('refuses to store an assessment that would not read back as saved', async () => {
    const invalid = { ...assessment('x', '2026-10-05'), reported: {} };
    const extra = { ...imported('y', '2026-10-05'), source: { ...PROVENANCE, fileName: 'scan.pdf' } } as BodyCompositionAssessment;
    await expect(repo.add(invalid)).rejects.toMatchObject({ reason: 'invalid-assessment' });
    await expect(repo.add(extra)).rejects.toMatchObject({ reason: 'invalid-assessment' });
    expect(storage.values.has(KEY)).toBe(false);
  });

  it('keeps unreadable stored items, including unknown fields, unchanged on every write and counts them', async () => {
    const newerProvenance = { ...imported('n', '2026-10-04'), source: { ...PROVENANCE, fileHash: 'sha256:abc' } };
    const newerMetric = { ...assessment('m', '2026-10-03'), reported: { 'skeletal-muscle-mass': { value: 35.1, unit: 'kg' } } };
    const broken = { id: 'odd', reported: 'big' };
    storage.values.set(KEY, JSON.stringify({ version: 1, assessments: [broken, newerProvenance, newerMetric, assessment('a', '2026-10-05')] }));
    expect((await repo.list()).map((a) => a.id)).toEqual(['a']);
    expect(await repo.countUnreadable()).toBe(3);

    await repo.add(assessment('b', '2026-10-06'));
    expect(stored(storage).assessments.slice(0, 3)).toEqual([broken, newerProvenance, newerMetric]);
    expect(storedIds(storage)).toEqual(['odd', 'n', 'm', 'a', 'b']);
  });

  it.each([
    ['corrupt JSON', '{oops'],
    ['a non-object', '[1,2]'],
    ['a missing assessments array', JSON.stringify({ version: 1 })],
    ['a newer version', JSON.stringify({ version: 2, assessments: [{ id: 'x' }] })],
    ['a newer version without assessments', JSON.stringify({ version: 2, records: [{ id: 'x' }] })],
    ['no version', JSON.stringify({ assessments: [] })],
  ])('%s is an error and is never overwritten', async (_, raw) => {
    storage.values.set(KEY, raw);
    await expect(repo.list()).rejects.toBeInstanceOf(BodyCompositionHistoryStorageError);
    await expect(repo.countUnreadable()).rejects.toBeInstanceOf(BodyCompositionHistoryStorageError);
    await expect(repo.add(assessment('a', '2026-10-05'))).rejects.toBeInstanceOf(BodyCompositionHistoryStorageError);
    expect(storage.values.get(KEY)).toBe(raw);
  });

  it('names the failure: unreadable data vs an unsupported version', async () => {
    storage.values.set(KEY, '{oops');
    await expect(repo.list()).rejects.toMatchObject({ reason: 'unreadable' });
    storage.values.set(KEY, JSON.stringify({ version: 2, assessments: [] }));
    await expect(repo.list()).rejects.toMatchObject({ reason: 'unsupported-version' });
  });

  it('a failed read rejects and nothing is written', async () => {
    vi.spyOn(storage, 'get').mockRejectedValue(new Error('unavailable'));
    const set = vi.spyOn(storage, 'set');
    await expect(repo.list()).rejects.toThrow();
    await expect(repo.add(assessment('a', '2026-10-05'))).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });

  it('a failed write is reported and the next add still works', async () => {
    storage.failWrites = true;
    await expect(repo.add(assessment('a', '2026-10-05'))).rejects.toMatchObject({ reason: 'write-failed' });
    expect(storage.values.has(KEY)).toBe(false);
    storage.failWrites = false;
    await repo.add(assessment('b', '2026-10-06'));
    expect(storedIds(storage)).toEqual(['b']);
  });

  it('serializes concurrent adds so none is lost', async () => {
    const set = storage.set.bind(storage);
    let call = 0;
    vi.spyOn(storage, 'set').mockImplementation(async (key, value) => {
      // Earlier writes are slower, so overlapping read-then-write would lose updates.
      await new Promise((resolve) => setTimeout(resolve, 10 - ++call * 2));
      return set(key, value);
    });
    await Promise.all(['a', 'b', 'c', 'd'].map((id, i) => repo.add(assessment(id, `2026-10-0${i + 1}`))));
    expect(storedIds(storage)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('BodyCompositionHistoryService', () => {
  let storage: MemoryKeyValueStorage;
  let now: Date;
  let ids: number;

  function setup(newId: () => string = () => `bc${++ids}`) {
    storage = new MemoryKeyValueStorage();
    storage.values.set(PROFILE_KEY, JSON.stringify({ version: 2, profile: PROFILE }));
    ids = 0;
    TestBed.configureTestingModule({
      providers: [
        { provide: KeyValueStorage, useValue: storage },
        { provide: CLOCK, useValue: () => now },
        { provide: BODY_COMPOSITION_ASSESSMENT_ID, useValue: newId },
      ],
    });
    return TestBed.inject(BodyCompositionHistoryService);
  }
  const ready = (service: BodyCompositionHistoryService) => {
    const s = service.state();
    if (s.status !== 'ready') {
      throw new Error(s.status);
    }
    return s;
  };

  beforeEach(() => {
    now = new Date(2026, 9, 9, 8, 0); // Friday 9 Oct 2026, local
  });

  it('loads an empty history', async () => {
    const service = setup();
    expect(service.state()).toEqual({ status: 'loading' });
    await service.load();
    expect(service.state()).toEqual({ status: 'ready', assessments: [] });
  });

  it('saves a manual assessment and reloads it in a new service', async () => {
    const service = setup();
    await service.load();
    const added = await service.add(manual(22.4));
    const createdAt = now.toISOString();
    const expected: BodyCompositionAssessment = {
      id: 'bc1',
      date: '2026-10-08',
      source: MANUAL_INBODY_SOURCE,
      reported: { 'body-fat-percentage': { value: 22.4, unit: '%' } },
      createdAt,
      updatedAt: createdAt,
    };
    expect(added).toEqual({ ok: true, assessment: expected });
    expect(ready(service).assessments).toEqual([expected]);

    const reloaded = TestBed.runInInjectionContext(() => new BodyCompositionHistoryService());
    await reloaded.load();
    expect(ready(reloaded).assessments).toEqual([expected]);
  });

  it('saves an imported report’s values and provenance exactly as parsed', async () => {
    const report: ParsedReport = {
      provenance: PROVENANCE,
      fields: [
        { label: 'Test Date', text: '2026.10.07' },
        { label: 'Weight', text: '176.83 lb' },
        { label: 'PBF', text: '22.19 %' },
      ],
      normalized: {
        date: { value: '2026-10-07', field: 0 },
        values: { weight: { value: 176.83, unit: 'lb', field: 1 }, 'body-fat-percentage': { value: 22.19, unit: '%', field: 2 } },
      },
    };
    const service = setup();
    await service.load();
    const added = await service.add(bodyCompositionInputFromReport(report));
    expect(added).toMatchObject({
      ok: true,
      assessment: {
        date: '2026-10-07',
        source: PROVENANCE,
        reported: { weight: { value: 176.83, unit: 'lb' }, 'body-fat-percentage': { value: 22.19, unit: '%' } },
      },
    });
    const [persisted] = stored(storage).assessments;
    expect(persisted.source).toEqual(PROVENANCE);
    expect(persisted.reported).toEqual({ weight: { value: 176.83, unit: 'lb' }, 'body-fat-percentage': { value: 22.19, unit: '%' } });
    // Printed fields and raw content are not part of a stored assessment.
    expect(JSON.stringify(persisted)).not.toContain('PBF');
    expect(Object.keys(persisted).sort()).toEqual(['createdAt', 'date', 'id', 'reported', 'source', 'updatedAt']);
  });

  it('keeps the shown list ordered by assessment date', async () => {
    const service = setup();
    await service.load();
    await service.add(manual(22, '2026-10-08'));
    await service.add(manual(23, '2026-10-02'));
    await service.add(manual(22.5, '2026-10-05'));
    expect(ready(service).assessments.map((a) => a.date)).toEqual(['2026-10-02', '2026-10-05', '2026-10-08']);
  });

  it('invalid input is returned with field errors and nothing is stored', async () => {
    const service = setup();
    await service.load();
    expect(await service.add(manual(120, '2026-10-12'))).toEqual({
      ok: false,
      kind: 'invalid',
      errors: { 'body-fat-percentage': 'out-of-range', date: 'future-date' },
    });
    expect(await service.add(manual(null))).toEqual({ ok: false, kind: 'invalid', errors: { values: 'required' } });
    expect(storage.values.has(KEY)).toBe(false);
  });

  it('a failed save is reported and not shown as done', async () => {
    const service = setup();
    await service.load();
    storage.failWrites = true;
    expect(await service.add(manual(22))).toEqual({ ok: false, kind: 'save-failed' });
    expect(ready(service).assessments).toEqual([]);
  });

  it('runs queued saves in call order; a failure mid-queue is reported and later saves still apply', async () => {
    const service = setup();
    await service.load();
    const order: string[] = [];
    const set = storage.set.bind(storage);
    let call = 0;
    vi.spyOn(storage, 'set').mockImplementation(async (key, value) => {
      const n = ++call;
      await new Promise((resolve) => setTimeout(resolve, 10 - n * 2));
      order.push(`write${n}`);
      if (n === 2) {
        throw new Error('disk full');
      }
      return set(key, value);
    });
    const results = await Promise.all([manual(22, '2026-10-01'), manual(23, '2026-10-02'), manual(24, '2026-10-03')].map((i) => service.add(i)));
    expect(order).toEqual(['write1', 'write2', 'write3']);
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(storedIds(storage)).toEqual(['bc1', 'bc3']);
    expect(ready(service).assessments.map((a) => a.id)).toEqual(['bc1', 'bc3']);
  });

  it('a duplicate generated id is refused, never overwriting the existing assessment', async () => {
    const service = setup(() => 'same');
    await service.load();
    await service.add(manual(22));
    expect(await service.add(manual(30))).toEqual({ ok: false, kind: 'save-failed' });
    expect(ready(service).assessments.map((a) => a.reported['body-fat-percentage']?.value)).toEqual([22]);
  });

  it.each([
    ['corrupt JSON', '{oops'],
    ['an unsupported version', JSON.stringify({ version: 2, assessments: [] })],
  ])('%s is an error state; saves fail without touching it; retrying recovers', async (_, raw) => {
    const service = setup();
    storage.values.set(KEY, raw);
    await service.load();
    expect(service.state()).toEqual({ status: 'error' });
    expect(await service.add(manual(22))).toEqual({ ok: false, kind: 'save-failed' });
    expect(storage.values.get(KEY)).toBe(raw);

    vi.spyOn(TestBed.inject(BodyCompositionHistoryRepository), 'list').mockResolvedValueOnce([]);
    await service.load();
    expect(service.state().status).toBe('ready');
  });

  it('reports how many stored assessments it can’t show', async () => {
    const service = setup();
    storage.values.set(KEY, JSON.stringify({ version: 1, assessments: [{ id: 'x' }, assessment('a', '2026-10-05')] }));
    expect(await service.unsupportedAssessmentCount()).toBe(1);
  });

  it('never changes the profile, weight history or tape measurements', async () => {
    const service = setup();
    const weights = JSON.stringify({ version: 1, entries: [{ id: 'w1', date: '2026-10-01', weight: { kilograms: 82 } }] });
    const measurements = JSON.stringify({ version: 1, entries: [{ id: 'm1', date: '2026-10-01', values: { waist: { centimeters: 80 } } }] });
    storage.values.set(WEIGHT_KEY, weights);
    storage.values.set(MEASUREMENT_KEY, measurements);
    const profileBefore = storage.values.get(PROFILE_KEY);
    const save = vi.spyOn(TestBed.inject(FitnessProfileService), 'save');
    await service.load();
    await service.add({ date: '2026-10-08', source: MANUAL_INBODY_SOURCE, values: { weight: { value: 75, unit: 'kg' } } });
    await service.add(bodyCompositionInputFromReport({
      provenance: PROVENANCE,
      fields: [{ label: 'Weight', text: '74.9 kg' }],
      normalized: { date: { value: '2026-10-08', field: 0 }, values: { weight: { value: 74.9, unit: 'kg', field: 0 } } },
    }));
    expect(storedIds(storage)).toEqual(['bc1', 'bc2']);
    expect(save).not.toHaveBeenCalled();
    expect(storage.values.get(PROFILE_KEY)).toBe(profileBefore);
    expect(storage.values.get(WEIGHT_KEY)).toBe(weights);
    expect(storage.values.get(MEASUREMENT_KEY)).toBe(measurements);
    expect([...storage.values.keys()].sort()).toEqual([KEY, WEIGHT_KEY, MEASUREMENT_KEY, PROFILE_KEY].sort());
  });
});
