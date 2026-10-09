import { TestBed } from '@angular/core/testing';

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
      storage.values.set(PROGRESS_KEY, JSON.stringify({ version: 2, ...saved }));
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
    flow.next(); // welcome → goal

    expect(flow.next()).toBe(false);
    expect(flow.stepId()).toBe('goal');
  });

  it('walks forward and back through the steps', async () => {
    const flow = await createFlow();
    flow.next();
    flow.update({ primaryGoal: 'lose-fat' });
    flow.next();

    expect(flow.stepId()).toBe('basics');
    expect(flow.position()).toEqual({ current: 2, total: 9 });

    flow.back();
    expect(flow.stepId()).toBe('goal');
    flow.back();
    expect(flow.stepId()).toBe('welcome');
  });

  it('skips the target step for goals without targets', async () => {
    const flow = await createFlow({
      stepId: 'activity',
      draft: completeDraft({ primaryGoal: 'get-stronger' }),
      editingFromSummary: false,
    });

    expect(flow.position()).toEqual({ current: 7, total: 8 });
    flow.next();
    expect(flow.stepId()).toBe('summary');
  });

  it('shows the target step for fat loss', async () => {
    const flow = await createFlow({ stepId: 'activity', draft: completeDraft(), editingFromSummary: false });
    flow.next();
    expect(flow.stepId()).toBe('goal-target');
  });

  it('persists answers and position, and restores them', async () => {
    const flow = await createFlow();
    flow.next();
    flow.update({ primaryGoal: 'build-muscle' });
    flow.next();

    expect(savedProgress()).toMatchObject({ stepId: 'basics', draft: { primaryGoal: 'build-muscle' } });

    TestBed.resetTestingModule();
    const restored = await createFlow();
    expect(restored.stepId()).toBe('basics');
    expect(restored.draft().primaryGoal).toBe('build-muscle');
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
      flow.startReview(profile);
      return { flow, profile };
    }

    it('opens the summary prefilled from the profile', async () => {
      const { flow } = await reviewFlow();
      expect(flow.mode()).toBe('review');
      expect(flow.stepId()).toBe('summary');
      expect(flow.draft()).toEqual(completeDraft());
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
  });

  describe('complete', () => {
    it('saves the profile, clears saved progress and shows finish', async () => {
      const flow = await createFlow({ stepId: 'summary', draft: completeDraft(), editingFromSummary: false });

      expect(await flow.complete()).toBe(true);

      expect(flow.stepId()).toBe('finish');
      expect(storage.values.has(PROGRESS_KEY)).toBe(false);
      expect(JSON.parse(storage.values.get(PROFILE_KEY)!).profile.primaryGoal).toBe('lose-fat');
      expect(TestBed.inject(FitnessProfileService).hasProfile()).toBe(true);
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
