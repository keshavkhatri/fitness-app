import { completeDraft } from '../testing/draft-fixtures';
import { EMPTY_BASICS, EMPTY_DRAFT, applyDraftChange, completeBasics, draftFromProfile, sanitizeDraft, toFitnessProfile } from './onboarding-draft';

describe('onboarding draft', () => {
  describe('applyDraftChange', () => {
    it('clears goal targets when the goal changes', () => {
      const draft = completeDraft({ primaryGoal: 'lose-fat', goalTarget: { targetWeight: { kilograms: 70 } } });

      expect(applyDraftChange(draft, { primaryGoal: 'build-muscle' }).goalTarget.targetWeight).toBeNull();
      expect(applyDraftChange(draft, { primaryGoal: 'lose-fat' }).goalTarget.targetWeight).toEqual({ kilograms: 70 });
    });

    it('prunes equipment that is not offered at the new location', () => {
      const draft = completeDraft({ trainingLocation: 'gym', equipment: ['full-gym', 'dumbbells'] });

      expect(applyDraftChange(draft, { trainingLocation: 'home' }).equipment).toEqual(['dumbbells']);
    });

    it('leaves unrelated answers alone', () => {
      const draft = completeDraft();
      expect(applyDraftChange(draft, { activityLevel: 'very-active' })).toEqual({ ...draft, activityLevel: 'very-active' });
    });
  });

  describe('toFitnessProfile', () => {
    it('builds a complete profile', () => {
      const now = new Date('2026-10-07T12:00:00Z');
      expect(toFitnessProfile(completeDraft(), now)).toEqual({
        primaryGoal: 'lose-fat',
        dateOfBirth: '1991-06-15',
        sex: 'female',
        height: { centimeters: 168 },
        weight: { kilograms: 80 },
        unitSystem: 'metric',
        trainingExperience: 'intermediate',
        trainingDaysPerWeek: 4,
        trainingLocation: 'gym',
        equipment: ['full-gym'],
        activityLevel: 'lightly-active',
        goalTarget: { targetWeight: { kilograms: 72 } },
        updatedAt: '2026-10-07T12:00:00.000Z',
      });
    });

    it('returns null when anything required is missing', () => {
      expect(toFitnessProfile(EMPTY_DRAFT, new Date())).toBeNull();
      expect(toFitnessProfile(completeDraft({ equipment: [] }), new Date())).toBeNull();
      expect(toFitnessProfile(completeDraft({ basics: EMPTY_BASICS }), new Date())).toBeNull();
      // One body detail still to answer is enough to wait.
      expect(toFitnessProfile(completeDraft({ basics: { ...completeDraft().basics, weight: null } }), new Date())).toBeNull();
    });
  });

  it('draftFromProfile round-trips with toFitnessProfile', () => {
    const now = new Date('2026-10-07T12:00:00Z');
    const profile = toFitnessProfile(completeDraft(), now)!;
    // The name isn't part of the profile: it comes from the identity store.
    expect(draftFromProfile(profile, 'Alex')).toEqual(completeDraft());
    expect(draftFromProfile(profile).name).toBeNull();
    expect(toFitnessProfile(draftFromProfile(profile, 'Alex'), now)).toEqual(profile);
    expect('name' in profile).toBe(false);
  });

  describe('sanitizeDraft (restoring untrusted data)', () => {
    it('restores a valid draft unchanged', () => {
      const draft = completeDraft();
      expect(sanitizeDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    });

    it('drops invalid answers instead of failing', () => {
      const restored = sanitizeDraft({
        ...completeDraft(),
        primaryGoal: 'get-huge',
        trainingDaysPerWeek: 7,
        unitSystem: 'cubits',
        equipment: ['dumbbells', 'teleporter'],
        basics: { dateOfBirth: '1991-02-30', sex: 'female', height: { centimeters: 168 }, weight: { kilograms: 80 } },
      });

      expect(restored.primaryGoal).toBeNull();
      expect(restored.trainingDaysPerWeek).toBeNull();
      expect(restored.unitSystem).toBe('metric');
      expect(restored.equipment).toEqual(['dumbbells']);
      // Only the bad answer is dropped: the other body details were answered on their own screens.
      expect(restored.basics).toEqual({ dateOfBirth: null, sex: 'female', height: { centimeters: 168 }, weight: { kilograms: 80 } });
      expect(restored.goalTarget).toEqual({ targetWeight: null }); // no goal → no targets
    });

    it('keeps body details answered so far (one screen at a time)', () => {
      const partial = { ...EMPTY_BASICS, sex: 'male', height: { centimeters: 181.5 } } as const;
      expect(sanitizeDraft({ ...EMPTY_DRAFT, basics: partial }).basics).toEqual(partial);
      expect(sanitizeDraft({ ...EMPTY_DRAFT, basics: null }).basics).toEqual(EMPTY_BASICS);
      expect(completeBasics(partial)).toBeNull();
      expect(completeBasics(completeDraft().basics)).toEqual(completeDraft().basics);
    });

    it('returns an empty draft for garbage', () => {
      expect(sanitizeDraft('nope')).toEqual(EMPTY_DRAFT);
      expect(sanitizeDraft(null)).toEqual(EMPTY_DRAFT);
    });
  });
});

describe('setup method', () => {
  it('restores a report setup and defaults anything else (e.g. older progress) to manual', () => {
    expect(sanitizeDraft({ ...EMPTY_DRAFT, setupMethod: 'report' }).setupMethod).toBe('report');
    expect(sanitizeDraft({ ...EMPTY_DRAFT, setupMethod: 'ocr' }).setupMethod).toBe('manual');
    const { setupMethod: _omitted, ...older } = EMPTY_DRAFT;
    expect(sanitizeDraft(older).setupMethod).toBe('manual');
  });
});
