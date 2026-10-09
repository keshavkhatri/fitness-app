import { TestBed } from '@angular/core/testing';

import { WeightEntry, weightRangeSummary } from '../../domain/body-measurements';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { FitnessAssessmentService } from '../calculations/fitness-assessment.service';
import { NutritionService } from '../nutrition/nutrition.service';
import { FitnessProfileRepository } from '../profile/fitness-profile.repository';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { OnboardingStatusService } from '../profile/onboarding-status.service';
import { KeyValueStorage } from '../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../storage/testing/memory-key-value-storage';
import { CLOCK } from '../time/clock';
import { WorkoutPlanService } from '../workout/workout-plan.service';
import { ProfileWeightService } from './profile-weight.service';
import { WeightHistoryRepository } from './weight-history.repository';
import { WeightHistoryService } from './weight-history.service';

const KEY = 'fitness.body-weight-entries';
const PROFILE_KEY = 'fitness.profile';
const REVIEWED_KEY = 'fitness.assessment-reviewed';
/** Friday 9 October 2026, 08:00 local. */
const NOW = new Date(2026, 9, 9, 8, 0);
const PROFILE: UserFitnessProfile = {
  primaryGoal: 'lose-fat',
  dateOfBirth: '1990-06-15',
  sex: 'male',
  height: { centimeters: 180 },
  weight: { kilograms: 82 },
  unitSystem: 'imperial',
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  trainingLocation: 'gym',
  equipment: ['full-gym', 'bench'],
  activityLevel: 'moderately-active',
  goalTarget: { targetWeight: { kilograms: 75 } },
  updatedAt: '2026-10-01T09:00:00.000Z',
};
const entry = (id: string, date: string, kilograms: number): WeightEntry => ({
  id,
  date,
  weight: { kilograms },
  createdAt: `${date}T07:00:00.000Z`,
  updatedAt: `${date}T07:30:00.000Z`,
});
const ENTRIES = [entry('a', '2026-09-20', 84.1), entry('b', '2026-10-01', 82), entry('c', '2026-10-08', 81.65)];

function setup(profile: UserFitnessProfile | null = PROFILE, entries: readonly WeightEntry[] = ENTRIES) {
  const storage = new MemoryKeyValueStorage();
  if (profile) {
    storage.values.set(PROFILE_KEY, JSON.stringify({ version: 2, profile }));
    storage.values.set(REVIEWED_KEY, JSON.stringify({ version: 1, profileUpdatedAt: profile.updatedAt }));
  }
  storage.values.set(KEY, JSON.stringify({ version: 1, entries }));
  TestBed.configureTestingModule({
    providers: [
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => NOW },
    ],
  });
  return { storage, service: TestBed.inject(ProfileWeightService), profiles: TestBed.inject(FitnessProfileService) };
}

const storedProfile = (storage: MemoryKeyValueStorage): UserFitnessProfile => JSON.parse(storage.values.get(PROFILE_KEY)!).profile;

describe('ProfileWeightService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('previewing never writes anything', async () => {
    const { service, storage } = setup();
    const before = new Map(storage.values);
    const set = vi.spyOn(storage, 'set');
    expect(await service.preview('c')).toEqual({ kind: 'ready', entry: ENTRIES[2], current: { kilograms: 82 }, unitSystem: 'imperial' });
    expect(set).not.toHaveBeenCalled();
    expect(storage.values).toEqual(before);
  });

  it('updates only the profile’s weight, to the entry’s exact kilograms, through the profile service', async () => {
    const { service, storage, profiles } = setup();
    const save = vi.spyOn(profiles, 'save');
    const result = await service.apply('c');
    const expected = { ...PROFILE, weight: { kilograms: 81.65 }, updatedAt: NOW.toISOString() };
    expect(result).toEqual({ ok: true, kind: 'updated', profile: expected });
    expect(save).toHaveBeenCalledTimes(1);
    expect(storedProfile(storage)).toEqual(expected);
    // Goal, DOB, height, activity, equipment, training preferences and target weight preserved.
    const { weight: _w, updatedAt: _u, ...rest } = storedProfile(storage);
    const { weight: _pw, updatedAt: _pu, ...original } = PROFILE;
    expect(rest).toEqual(original);
    expect(profiles.profile()).toEqual(expected);
    // Profile review, Home and other profile readers load through the same service.
    expect(await profiles.load()).toEqual(expected);
  });

  it('leaves the history (entries, ids, dates, timestamps) and its trend summaries unchanged', async () => {
    const { service, storage } = setup();
    const raw = storage.values.get(KEY);
    const summaryBefore = weightRangeSummary(ENTRIES, 'all', '2026-10-09', 'imperial');
    await service.apply('a');
    expect(storage.values.get(KEY)).toBe(raw);
    const entries = await TestBed.inject(WeightHistoryRepository).list();
    expect(entries).toEqual(ENTRIES);
    expect(weightRangeSummary(entries, 'all', '2026-10-09', 'imperial')).toEqual(summaryBefore);
  });

  it('the same weight is reported without writing', async () => {
    const { service, storage, profiles } = setup();
    const save = vi.spyOn(profiles, 'save');
    expect((await service.preview('b')).kind).toBe('same');
    expect(await service.apply('b')).toEqual({ ok: true, kind: 'unchanged' });
    expect(save).not.toHaveBeenCalled();
    expect(storedProfile(storage)).toEqual(PROFILE);
  });

  it('no profile: nothing is created', async () => {
    const { service, storage } = setup(null);
    expect(await service.preview('c')).toEqual({ kind: 'no-profile' });
    expect(await service.apply('c')).toEqual({ ok: false, kind: 'no-profile' });
    expect(storage.values.has(PROFILE_KEY)).toBe(false);
  });

  it('a missing entry (e.g. deleted after opening) is never applied', async () => {
    const { service, storage } = setup();
    expect(await service.preview('gone')).toEqual({ kind: 'entry-missing' });
    await TestBed.inject(WeightHistoryService).remove(ENTRIES[2]);
    expect(await service.apply('c')).toEqual({ ok: false, kind: 'entry-missing' });
    expect(storedProfile(storage)).toEqual(PROFILE);
  });

  it('an invalid stored entry is never applied', async () => {
    const { service, storage } = setup(PROFILE, []);
    storage.values.set(KEY, JSON.stringify({ version: 1, entries: [{ ...ENTRIES[2], weight: { kilograms: 3 } }] }));
    expect(await service.apply('c')).toEqual({ ok: false, kind: 'entry-missing' });
    vi.spyOn(TestBed.inject(WeightHistoryRepository), 'list').mockResolvedValue([{ ...ENTRIES[2], weight: { kilograms: 3 } }]);
    expect(await service.preview('c')).toEqual({ kind: 'entry-invalid' });
    expect(await service.apply('c')).toEqual({ ok: false, kind: 'entry-invalid' });
    expect(storedProfile(storage)).toEqual(PROFILE);
  });

  it('a profile read failure is reported (not mistaken for "no profile") and nothing is written', async () => {
    const { service, storage } = setup();
    const set = vi.spyOn(storage, 'set');
    vi.spyOn(TestBed.inject(FitnessProfileRepository), 'load').mockRejectedValueOnce(new Error('read')).mockRejectedValueOnce(new Error('read'));
    expect(await service.preview('c')).toEqual({ kind: 'profile-unavailable' });
    expect(await service.apply('c')).toEqual({ ok: false, kind: 'profile-unavailable' });
    expect(set).not.toHaveBeenCalled();
    // Recovers once the profile can be read.
    expect((await service.apply('c')).ok).toBe(true);
  });

  it('a history read failure is reported and nothing is written', async () => {
    const { service, storage } = setup();
    vi.spyOn(TestBed.inject(WeightHistoryRepository), 'list').mockRejectedValue(new Error('read'));
    expect(await service.apply('c')).toEqual({ ok: false, kind: 'history-unavailable' });
    expect(storedProfile(storage)).toEqual(PROFILE);
  });

  it('a failed write is reported; the saved and cached profile stay as they were', async () => {
    const { service, storage, profiles } = setup();
    await profiles.load();
    storage.failWrites = true;
    expect(await service.apply('c')).toEqual({ ok: false, kind: 'save-failed' });
    expect(storedProfile(storage)).toEqual(PROFILE);
    expect(profiles.profile()).toEqual(PROFILE);
    expect(storage.values.get(KEY)).toBe(JSON.stringify({ version: 1, entries: ENTRIES }));
    storage.failWrites = false;
    expect((await service.apply('c')).ok).toBe(true);
  });

  it('concurrent requests are serialized: one write, the repeat finds nothing to change', async () => {
    const { service, profiles } = setup();
    const save = vi.spyOn(profiles, 'save');
    const results = await Promise.all([service.apply('c'), service.apply('c')]);
    expect(results.map((r) => r.ok && r.kind)).toEqual(['updated', 'unchanged']);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('applies to the latest saved profile (another profile edit in between is kept)', async () => {
    const { service, storage, profiles } = setup();
    await profiles.save({ ...PROFILE, activityLevel: 'very-active' });
    await service.apply('c');
    expect(storedProfile(storage)).toMatchObject({ activityLevel: 'very-active', weight: { kilograms: 81.65 } });
  });

  it('a profile edit saved while the confirmation is open is kept', async () => {
    const { service, storage, profiles } = setup();
    expect((await service.preview('c')).kind).toBe('ready');
    const edited: UserFitnessProfile = { ...PROFILE, activityLevel: 'very-active', updatedAt: '2026-10-09T07:00:00.000Z' };
    await profiles.save(edited);
    const expected = { ...edited, weight: { kilograms: 81.65 }, updatedAt: NOW.toISOString() };
    expect(await service.apply('c')).toEqual({ ok: true, kind: 'updated', profile: expected });
    expect(storedProfile(storage)).toEqual(expected);
    expect(profiles.profile()).toEqual(expected);
  });

  it('applies to the persisted profile, not a stale cached copy (e.g. edited in another tab while confirming)', async () => {
    const { service, storage, profiles } = setup();
    expect((await service.preview('c')).kind).toBe('ready');
    // Written straight to storage, bypassing this app instance's profile cache.
    const elsewhere: UserFitnessProfile = { ...PROFILE, trainingDaysPerWeek: 5, updatedAt: '2026-10-09T07:00:00.000Z' };
    storage.values.set(PROFILE_KEY, JSON.stringify({ version: 2, profile: elsewhere }));
    const expected = { ...elsewhere, weight: { kilograms: 81.65 }, updatedAt: NOW.toISOString() };
    expect(await service.apply('c')).toEqual({ ok: true, kind: 'updated', profile: expected });
    expect(storedProfile(storage)).toEqual(expected);
    expect(profiles.profile()).toEqual(expected);
  });

  it('a profile already updated elsewhere to this weight is not written again', async () => {
    const { service, storage, profiles } = setup();
    await profiles.load();
    const elsewhere: UserFitnessProfile = { ...PROFILE, weight: { kilograms: 81.65 }, updatedAt: '2026-10-09T07:00:00.000Z' };
    storage.values.set(PROFILE_KEY, JSON.stringify({ version: 2, profile: elsewhere }));
    const save = vi.spyOn(profiles, 'save');
    expect(await service.apply('c')).toEqual({ ok: true, kind: 'unchanged' });
    expect(save).not.toHaveBeenCalled();
    expect(storedProfile(storage)).toEqual(elsewhere);
  });

  it('concurrent requests for different entries are applied in order; other fields intact', async () => {
    const { service, storage, profiles } = setup();
    const save = vi.spyOn(profiles, 'save');
    const results = await Promise.all([service.apply('a'), service.apply('c'), service.apply('c')]);
    expect(results.map((r) => r.ok && r.kind)).toEqual(['updated', 'updated', 'unchanged']);
    expect(save).toHaveBeenCalledTimes(2);
    expect(storedProfile(storage)).toEqual({ ...PROFILE, weight: { kilograms: 81.65 }, updatedAt: NOW.toISOString() });
  });

  describe('dependent features (existing refresh rules)', () => {
    it('the assessment is recalculated from the new weight and asks for review again, like any profile edit', async () => {
      const { service } = setup();
      const status = TestBed.inject(OnboardingStatusService);
      const assessments = TestBed.inject(FitnessAssessmentService);
      expect(await status.status()).toBe('complete');
      const before = await assessments.current();
      await service.apply('a');
      const after = await assessments.current();
      expect(after.kind === 'ready' && after.profile.weight).toEqual({ kilograms: 84.1 });
      expect(after).not.toEqual(before);
      expect(await status.status()).toBe('needs-assessment');
    });

    it('Nutrition targets change only when refreshed (its re-entry lifecycle); food logs untouched', async () => {
      const { service } = setup();
      const nutrition = TestBed.inject(NutritionService);
      await nutrition.load();
      const before = nutrition.state();
      await service.apply('a');
      expect(nutrition.state()).toBe(before);
      await nutrition.refreshTargets();
      const after = nutrition.state();
      expect(after.status === 'ready' && before.status === 'ready' && after.day).toEqual(before.status === 'ready' && before.day);
      expect(after.status === 'ready' && after.targets).not.toEqual(before.status === 'ready' && before.targets);
    });

    it('the workout plan is kept (weight is not a programming input)', async () => {
      const { service } = setup();
      const plans = TestBed.inject(WorkoutPlanService);
      const first = await plans.load();
      await service.apply('a');
      const second = await plans.load();
      expect(second.kind === 'ready' && second.origin).toBe('stored');
      expect(second.kind === 'ready' && first.kind === 'ready' && second.plan).toBe(first.kind === 'ready' && first.plan);
    });
  });
});
