import { Injectable, computed, inject, signal } from '@angular/core';

import { FirstRunOfferService } from '../../../core/entitlements/first-run-offer.service';
import { FitnessProfileService } from '../../../core/profile/fitness-profile.service';
import { ReportResults } from '../../body-composition/report-results.service';
import { UserFitnessProfile } from '../../../domain/fitness-profile';
import { firstIncompleteStep, validateStep } from '../validation/onboarding-validation';
import { OnboardingDraft, applyDraftChange, draftFromProfile, toFitnessProfile } from './onboarding-draft';
import { INITIAL_PROGRESS, OnboardingProgress, OnboardingProgressStore } from './onboarding-progress.store';
import { OnboardingStepId, applicableSteps, stepById } from './onboarding-steps';
import { ReportImport } from './report-import.service';
import { PendingReportStore } from './pending-report.store';
import { CLOCK, localIsoDate } from '../../../core/time/clock';
import { inBodyPrefill } from '../../../domain/inbody-extraction';

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
  private readonly offer = inject(FirstRunOfferService);
  /** The report read during setup, if any (provided with the flow on the onboarding route). */
  private readonly report = inject(ReportImport, { optional: true });
  private readonly reportResults = inject(ReportResults);
  private readonly pendingReport = inject(PendingReportStore);
  private readonly clock = inject(CLOCK);

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
    return (kind === 'question' || kind === 'review' || kind === 'account') && this.saveStatus() !== 'saving';
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

  /**
   * First run: from the summary to the account gate, once every answer is complete. Nothing is saved
   * yet: the profile (and so the assessment and plan) is created only from the account step.
   */
  continueToAccount(): boolean {
    const incomplete = firstIncompleteStep(this.draft());
    if (incomplete) {
      this.goTo(incomplete, true);
      return false;
    }
    // Signing in may leave the page: the report the user chose to keep has to outlive this session.
    const reading = this.report?.reading();
    if (reading && this.report?.keepResults()) {
      void this.pendingReport.save({ extraction: reading.extraction, logWeights: this.report.logWeights() });
    } else {
      void this.pendingReport.clear();
    }
    this.goTo('account', false);
    return true;
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
    // The name is the account's (set at the account step) or edited in You: never written from here.
    await this.store.clear().catch(() => undefined);
    if (this.mode() === 'new') {
      // The InBody report read during setup becomes body composition (and weigh-ins), as on the You tab: from this
      // session, or (after signing in left the page) from where the account step kept it. Best effort: the profile
      // exists either way, and everything can be added again from You.
      await this.keepReport().catch(() => undefined);
      // A new user sees the plan offer once, after their assessment (the profile editor never does).
      await this.offer.markPending();
      // Not persisted: progress was just cleared and the profile now exists.
      this.state.set({ ...this.state(), stepId: 'finish', editingFromSummary: false });
    }
    return true;
  }

  private async keepReport(): Promise<void> {
    const reading = this.report?.reading();
    const pending = reading ? null : await this.pendingReport.load();
    try {
      if (reading && this.report?.keepResults()) {
        await this.reportResults.saveReading(reading.prefill, { logWeights: this.report.logWeights() });
      } else if (pending) {
        const prefill = inBodyPrefill(pending.extraction, localIsoDate(this.clock()));
        if (prefill.kind === 'prefill') {
          await this.reportResults.saveReading(prefill, { logWeights: pending.logWeights });
        }
      }
    } finally {
      await this.pendingReport.clear();
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
