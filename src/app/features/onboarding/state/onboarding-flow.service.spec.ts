import { TestBed } from '@angular/core/testing';

import { UserIdentityService } from '../../../core/identity/user-identity.service';
import { FitnessProfileService } from '../../../core/profile/fitness-profile.service';
import { KeyValueStorage } from '../../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../../core/storage/testing/memory-key-value-storage';
import { completeDraft } from '../testing/draft-fixtures';
import { toFitnessProfile } from './onboarding-draft';
import { OnboardingFlow } from './onboarding-flow.service';
import { OnboardingProgress } from './onboarding-progress.store';

const PROGRESS_KEY = 'fitness.onboarding-progress';
const PROFILE_KEY = 'fitness.profile';

describe('OnboardingFlow', () => {
  let storage: MemoryKeyValueStorage;

  async function createFlow(saved?: OnboardingProgress): Promise<OnboardingFlow> {
    if (saved) {
      storage.values.set(PROGRESS_KEY, JSON.stringify({ version: 3, ...saved }));
    }
    TestBed.configureTestingModule({
      providers: [OnboardingFlow, { provide: KeyValueStorage, useValue: storage }],
    });
    const flow = TestBed.inject(OnboardingFlow);
    await flow.restore();
    return flow;
  }

  const savedProgress = () => JSON.parse(storage.values.get(PROGRESS_KEY) ?? 'null');

  beforeEach(() => {
    storage = new MemoryKeyValueStorage();
  });

  it('starts at welcome with no progress indicator', async () => {
    const flow = await createFlow();

    expect(flow.stepId()).toBe('welcome');
    expect(flow.position()).toBeNull();
    expect(flow.canGoBack()).toBe(false);
  });

  it('does not advance past an unanswered question', async () => {
    const flow = await createFlow();
    flow.next(); // welcome → basics

    expect(flow.next()).toBe(false);
    expect(flow.stepId()).toBe('basics');
    // Name alone isn't enough: sex and date of birth are on the same screen.
    flow.update({ name: 'Alex' });
    expect(flow.next()).toBe(false);
    flow.update({ basics: { ...flow.draft().basics, dateOfBirth: '1991-06-15', sex: 'female' } });
    flow.next(); // basics → height

    expect(flow.next()).toBe(false);
    expect(flow.stepId()).toBe('height');
  });

  it('walks forward and back through the steps, in the order of the design', async () => {
    const flow = await createFlow();
    flow.next();
    expect(flow.stepId()).toBe('basics');
    expect(flow.position()).toEqual({ current: 1, total: 11 });
    flow.update({ name: 'Alex', basics: { dateOfBirth: '1991-06-15', sex: 'female', height: null, weight: null } });
    flow.next();
    expect(flow.stepId()).toBe('height');
    flow.update({ basics: { ...flow.draft().basics, height: { centimeters: 168 } } });
    flow.next();
    expect(flow.stepId()).toBe('weight');
    flow.update({ basics: { ...flow.draft().basics, weight: { kilograms: 80 } } });
    flow.next();
    expect(flow.stepId()).toBe('activity');
    expect(flow.position()).toEqual({ current: 4, total: 11 });
    flow.update({ activityLevel: 'lightly-active' });
    flow.next();
    expect(flow.stepId()).toBe('goal');

    flow.back();
    expect(flow.stepId()).toBe('activity');
    flow.back();
    expect(flow.stepId()).toBe('weight');
    flow.back();
    expect(flow.stepId()).toBe('height');
    flow.back();
    expect(flow.stepId()).toBe('basics');
    flow.back();
    expect(flow.stepId()).toBe('welcome');
    // Going back loses nothing.
    expect(flow.draft().basics).toEqual({ dateOfBirth: '1991-06-15', sex: 'female', height: { centimeters: 168 }, weight: { kilograms: 80 } });
  });

  it('starts the report path with the upload, then the same screens', async () => {
    const flow = await createFlow();
    flow.update({ setupMethod: 'report' });
    flow.next();
    expect(flow.stepId()).toBe('report');
    expect(flow.position()).toEqual({ current: 1, total: 12 });
  });

  it('skips the target step for goals without targets', async () => {
    const flow = await createFlow({
      stepId: 'goal',
      draft: completeDraft({ primaryGoal: 'get-stronger' }),
      editingFromSummary: false,
    });

    expect(flow.position()).toEqual({ current: 5, total: 10 });
    flow.next();
    expect(flow.stepId()).toBe('experience');
  });

  it('shows the target step for fat loss', async () => {
    const flow = await createFlow({ stepId: 'goal', draft: completeDraft(), editingFromSummary: false });
    flow.next();
    expect(flow.stepId()).toBe('goal-target');
  });

  it('persists answers and position, and restores them', async () => {
    const flow = await createFlow();
    flow.next();
    flow.update({ name: 'Alex', basics: { dateOfBirth: '1991-06-15', sex: 'male', height: null, weight: null } });
    flow.next();
    flow.update({ basics: { ...flow.draft().basics, height: { centimeters: 181.5 } } });
    flow.next();

    expect(savedProgress()).toMatchObject({ version: 3, stepId: 'weight', draft: { name: 'Alex', basics: { height: { centimeters: 181.5 }, weight: null } } });

    TestBed.resetTestingModule();
    const restored = await createFlow();
    expect(restored.stepId()).toBe('weight');
    expect(restored.draft().basics).toEqual({ dateOfBirth: '1991-06-15', sex: 'male', height: { centimeters: 181.5 }, weight: null });
    expect(restored.draft().name).toBe('Alex');
  });

  it('resumes progress saved by the previous version (one basics screen, a separate name step)', async () => {
    storage.values.set(
      PROGRESS_KEY,
      JSON.stringify({ version: 2, stepId: 'name', draft: { ...completeDraft(), name: null }, editingFromSummary: false }),
    );
    const flow = await createFlow();
    expect(flow.stepId()).toBe('basics'); // the name moved onto this screen
    expect(flow.draft().basics).toEqual(completeDraft().basics);
  });

  it('starts fresh when saved progress is corrupt', async () => {
    storage.values.set(PROGRESS_KEY, '{not json');
    const flow = await createFlow();
    expect(flow.stepId()).toBe('welcome');
  });

  describe('editing from the summary', () => {
    it('returns to the summary after editing a section', async () => {
      const flow = await createFlow({ stepId: 'summary', draft: completeDraft(), editingFromSummary: false });

      flow.edit('activity');
      flow.update({ activityLevel: 'very-active' });
      flow.next();

      expect(flow.stepId()).toBe('summary');
      expect(flow.draft().activityLevel).toBe('very-active');
    });

    it('visits dependent steps: new goal → its target', async () => {
      const flow = await createFlow({
        stepId: 'summary',
        draft: completeDraft({ primaryGoal: 'get-stronger' }),
        editingFromSummary: false,
      });

      flow.edit('goal');
      flow.update({ primaryGoal: 'build-muscle' });
      flow.next();
      expect(flow.stepId()).toBe('goal-target');

      flow.next();
      expect(flow.stepId()).toBe('summary');
    });

    it('visits dependent steps: new location → its equipment', async () => {
      const flow = await createFlow({ stepId: 'summary', draft: completeDraft(), editingFromSummary: false });

      flow.edit('location');
      flow.update({ trainingLocation: 'home' }); // prunes "full-gym" → equipment now empty
      flow.next();
      expect(flow.stepId()).toBe('equipment');
      expect(flow.next()).toBe(false); // must pick home equipment first
    });

    it('a new weight is checked against the target it was set from', async () => {
      const flow = await createFlow({ stepId: 'summary', draft: completeDraft(), editingFromSummary: false });
      flow.edit('weight');
      flow.update({ basics: { ...flow.draft().basics, weight: { kilograms: 70 } } }); // target 72 kg is now above it
      flow.next();
      expect(flow.stepId()).toBe('goal-target');
      expect(flow.next()).toBe(false);
    });

    it('back returns to the summary', async () => {
      const flow = await createFlow({ stepId: 'summary', draft: completeDraft(), editingFromSummary: false });
      flow.edit('frequency');
      flow.back();
      expect(flow.stepId()).toBe('summary');
    });
  });

  describe('review mode (editing an existing profile)', () => {
    async function reviewFlow() {
      const flow = await createFlow();
      const profile = toFitnessProfile(completeDraft(), new Date('2026-10-01T09:00:00Z'))!;
      flow.startReview(profile, 'Alex');
      return { flow, profile };
    }

    it('opens the summary prefilled from the profile', async () => {
      const { flow } = await reviewFlow();
      expect(flow.mode()).toBe('review');
      expect(flow.stepId()).toBe('summary');
      expect(flow.draft()).toEqual(completeDraft());
    });

    it('a profile saved before names existed asks for one before saving, then saves it', async () => {
      const flow = await createFlow();
      flow.startReview(toFitnessProfile(completeDraft(), new Date('2026-10-01T09:00:00Z'))!);
      expect(await flow.complete()).toBe(false);
      expect(flow.stepId()).toBe('basics');

      flow.update({ name: 'Sam' });
      flow.next();
      expect(flow.stepId()).toBe('summary');
      expect(await flow.complete()).toBe(true);
      expect(TestBed.inject(UserIdentityService).identity().name).toBe('Sam');
    });

    it('does not persist in-progress edits', async () => {
      const { flow } = await reviewFlow();
      flow.edit('activity');
      flow.update({ activityLevel: 'very-active' });
      flow.next();
      expect(storage.values.has(PROGRESS_KEY)).toBe(false);
    });

    it('saves an updated profile without moving to the new-user finish step', async () => {
      const { flow, profile } = await reviewFlow();
      flow.edit('activity');
      flow.update({ activityLevel: 'very-active' });
      flow.next();

      expect(await flow.complete()).toBe(true);
      expect(flow.stepId()).toBe('summary');
      const saved = TestBed.inject(FitnessProfileService).profile();
      expect(saved?.activityLevel).toBe('very-active');
      expect(saved?.updatedAt).not.toBe(profile.updatedAt); // so the assessment is shown again
    });

    describe('an accepted Calorie Check-in calibration', () => {
      const energyCalibration = { maintenanceKcal: 2450, observedFrom: '2026-09-01', observedTo: '2026-09-28', acceptedAt: '2026-09-29T09:00:00.000Z' };
      async function calibratedReview() {
        const flow = await createFlow();
        flow.startReview({ ...toFitnessProfile(completeDraft(), new Date('2026-10-01T09:00:00Z'))!, energyCalibration }, 'Alex');
        return flow;
      }

      it('is kept when other answers change, so the calorie target doesn’t change silently', async () => {
        const flow = await calibratedReview();
        flow.edit('equipment');
        flow.update({ equipment: ['dumbbells'] });
        expect(await flow.complete()).toBe(true);
        expect(TestBed.inject(FitnessProfileService).profile()?.energyCalibration).toEqual(energyCalibration);
      });

      it('is dropped when the activity level changes (energy needs changed; the formula is used again)', async () => {
        const flow = await calibratedReview();
        flow.edit('activity');
        flow.update({ activityLevel: 'very-active' });
        expect(await flow.complete()).toBe(true);
        expect(TestBed.inject(FitnessProfileService).profile()?.energyCalibration).toBeUndefined();
      });
    });
  });

  describe('complete', () => {
    it('saves the profile, clears saved progress and shows finish', async () => {
      const flow = await createFlow({ stepId: 'summary', draft: completeDraft(), editingFromSummary: false });

      expect(await flow.complete()).toBe(true);

      expect(flow.stepId()).toBe('finish');
      expect(storage.values.has(PROGRESS_KEY)).toBe(false);
      expect(JSON.parse(storage.values.get(PROFILE_KEY)!).profile.primaryGoal).toBe('lose-fat');
      expect(TestBed.inject(FitnessProfileService).hasProfile()).toBe(true);
      // The name goes to the identity store (Home's greeting), not into the profile.
      expect(JSON.parse(storage.values.get('fitness.identity')!)).toEqual({ version: 1, name: 'Alex', photo: null });
      expect(JSON.parse(storage.values.get(PROFILE_KEY)!).profile.name).toBeUndefined();
    });

    it('keeps a photo already saved with the name', async () => {
      const photo = 'data:image/jpeg;base64,/9j/4AAQ';
      storage.values.set('fitness.identity', JSON.stringify({ version: 1, name: 'Old', photo }));
      const flow = await createFlow({ stepId: 'summary', draft: completeDraft(), editingFromSummary: false });
      expect(await flow.complete()).toBe(true);
      expect(JSON.parse(storage.values.get('fitness.identity')!)).toEqual({ version: 1, name: 'Alex', photo });
    });

    it('reports an error and keeps the answers when saving fails', async () => {
      const flow = await createFlow({ stepId: 'summary', draft: completeDraft(), editingFromSummary: false });
      storage.failWrites = true;

      expect(await flow.complete()).toBe(false);

      expect(flow.saveStatus()).toBe('error');
      expect(flow.stepId()).toBe('summary');
      expect(flow.draft()).toEqual(completeDraft());

      storage.failWrites = false;
      expect(await flow.complete()).toBe(true); // retry works
    });

    it('sends the user to the first missing answer instead of saving', async () => {
      const flow = await createFlow({
        stepId: 'summary',
        draft: completeDraft({ trainingExperience: null }),
        editingFromSummary: false,
      });

      expect(await flow.complete()).toBe(false);
      expect(flow.stepId()).toBe('experience');
      expect(storage.values.has(PROFILE_KEY)).toBe(false);
    });
  });
});
