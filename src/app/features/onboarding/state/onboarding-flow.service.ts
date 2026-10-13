import { Injectable, computed, inject, signal } from '@angular/core';

import { UserIdentityService } from '../../../core/identity/user-identity.service';
import { FitnessProfileService } from '../../../core/profile/fitness-profile.service';
import { UserFitnessProfile } from '../../../domain/fitness-profile';
import { firstIncompleteStep, validateStep } from '../validation/onboarding-validation';
import { OnboardingDraft, applyDraftChange, draftFromProfile, toFitnessProfile } from './onboarding-draft';
import { INITIAL_PROGRESS, OnboardingProgress, OnboardingProgressStore } from './onboarding-progress.store';
import { OnboardingStepId, applicableSteps, stepById } from './onboarding-steps';

export type ProfileSaveStatus = 'idle' | 'saving' | 'error';

/**
 * - new: first-run onboarding; progress is persisted so it can be resumed.
 * - review: editing an existing profile from its summary; nothing is
 *   persisted until the profile is saved (the stored profile is the source).
 */
export type OnboardingMode = 'new' | 'review';

/**
 * When a section is edited from the summary, these steps are revisited next
 * because their answers depend on it (new goal → its target; new location →
 * its equipment).
 */
const EDIT_FOLLOW_UPS: Partial<Record<OnboardingStepId, OnboardingStepId>> = {
  goal: 'goal-target',
  location: 'equipment',
};

/**
 * Onboarding flow state: current step, answers, navigation and completion.
 * Provided per onboarding route; UI components read signals and call methods,
 * and never decide navigation themselves.
 */
@Injectable()
export class OnboardingFlow {
  private readonly store = inject(OnboardingProgressStore);
  private readonly profiles = inject(FitnessProfileService);
  private readonly identity = inject(UserIdentityService);

  private readonly state = signal<OnboardingProgress>(INITIAL_PROGRESS);

  readonly ready = signal(false);
  readonly mode = signal<OnboardingMode>('new');
  readonly saveStatus = signal<ProfileSaveStatus>('idle');

  readonly draft = computed(() => this.state().draft);
  readonly stepId = computed(() => this.state().stepId);
  readonly step = computed(() => stepById(this.stepId()));
  readonly editingFromSummary = computed(() => this.state().editingFromSummary);

  /** Position among question + review steps, for the progress indicator. */
  readonly position = computed(() => {
    const counted = applicableSteps(this.draft()).filter((s) => s.kind === 'question' || s.kind === 'review');
    const index = counted.findIndex((s) => s.id === this.stepId());
    return index < 0 ? null : { current: index + 1, total: counted.length };
  });

  readonly canGoBack = computed(() => {
    const kind = this.step().kind;
    return (kind === 'question' || kind === 'review') && this.saveStatus() !== 'saving';
  });

  /** Loads saved progress once. */
  async restore(): Promise<void> {
    if (this.ready()) {
      return;
    }
    this.state.set(await this.store.load());
    this.ready.set(true);
  }

  /** The profile being reviewed (review mode), for values the questionnaire doesn't edit. */
  private reviewed: UserFitnessProfile | null = null;

  /** Opens the summary of an existing profile (and the saved name) for review/editing. */
  startReview(profile: UserFitnessProfile, name: string | null = null): void {
    this.reviewed = profile;
    this.mode.set('review');
    this.state.set({ stepId: 'summary', draft: draftFromProfile(profile, name), editingFromSummary: false });
    this.ready.set(true);
  }

  update(change: Partial<OnboardingDraft>): void {
    this.setState({ ...this.state(), draft: applyDraftChange(this.draft(), change) });
  }

  /** Advances past the current step if its answer is valid. Returns false otherwise. */
  next(): boolean {
    const { stepId, draft, editingFromSummary } = this.state();
    if (validateStep(stepId, draft) !== null) {
      return false;
    }
    const steps = applicableSteps(draft);

    if (editingFromSummary) {
      const followUp = EDIT_FOLLOW_UPS[stepId];
      const target =
        firstIncompleteStep(draft) ?? (followUp && steps.some((s) => s.id === followUp) ? followUp : 'summary');
      this.goTo(target, target !== 'summary');
      return true;
    }

    const index = steps.findIndex((s) => s.id === stepId);
    this.goTo(steps[index + 1]?.id ?? 'summary', false);
    return true;
  }

  back(): void {
    if (!this.canGoBack()) {
      return;
    }
    if (this.editingFromSummary()) {
      this.goTo('summary', false);
      return;
    }
    const steps = applicableSteps(this.draft());
    const index = steps.findIndex((s) => s.id === this.stepId());
    this.goTo(steps[Math.max(index - 1, 0)].id, false);
  }

  /**
   * Leaves the report upload for manual entry. Answers given so far are kept;
   * from the upload step the user continues with their basics.
   */
  useManualEntry(): void {
    const fromReport = this.stepId() === 'report';
    this.update({ setupMethod: 'manual' });
    if (fromReport) {
      this.goTo('basics', false);
    }
  }

  /** Opens a section from the summary for editing. */
  edit(stepId: OnboardingStepId): void {
    this.goTo(stepId, true);
  }

  /**
   * Creates (or, in review mode, updates) the profile from the current
   * answers. On success saved progress is discarded; new users move to the
   * finish step, reviewers stay put and the page navigates on.
   */
  async complete(): Promise<boolean> {
    if (this.saveStatus() === 'saving') {
      return false;
    }
    const draft = this.draft();
    const incomplete = firstIncompleteStep(draft);
    const profile = withKeptCalibration(toFitnessProfile(draft, new Date()), this.mode() === 'review' ? this.reviewed : null);
    if (incomplete || !profile) {
      this.goTo(incomplete ?? 'goal', true);
      return false;
    }

    this.saveStatus.set('saving');
    try {
      await this.profiles.save(profile);
    } catch {
      this.saveStatus.set('error');
      return false;
    }
    this.saveStatus.set('idle');
    await this.saveName(draft.name);
    await this.store.clear().catch(() => undefined);
    if (this.mode() === 'new') {
      // Not persisted: progress was just cleared and the profile now exists.
      this.state.set({ ...this.state(), stepId: 'finish', editingFromSummary: false });
    }
    return true;
  }

  /**
   * Saves the name for Home's greeting, keeping any photo. Cosmetic: a failed
   * write never undoes the saved profile (the name can be set again in You).
   */
  private async saveName(name: string | null): Promise<void> {
    try {
      const current = await this.identity.load();
      if (current.name !== name) {
        await this.identity.save({ name, photo: current.photo });
      }
    } catch {
      // Not critical.
    }
  }

  private goTo(stepId: OnboardingStepId, editingFromSummary: boolean): void {
    this.saveStatus.set('idle');
    this.setState({ ...this.state(), stepId, editingFromSummary });
  }

  private setState(progress: OnboardingProgress): void {
    this.state.set(progress);
    if (this.mode() === 'new') {
      void this.store.save(progress);
    }
  }
}

/**
 * An accepted Calorie Check-in calibration survives a profile review, so
 * editing e.g. equipment never silently changes the calorie target. A new
 * activity level changes energy needs, so the formula estimate is used again
 * (and the assessment that follows shows the new target).
 */
function withKeptCalibration(profile: UserFitnessProfile | null, previous: UserFitnessProfile | null): UserFitnessProfile | null {
  return profile && previous?.energyCalibration && previous.activityLevel === profile.activityLevel
    ? { ...profile, energyCalibration: previous.energyCalibration }
    : profile;
}
