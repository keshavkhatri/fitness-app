import { Signal } from '@angular/core';

/**
 * Contract between the onboarding page and the active step component.
 *
 * The page owns the Continue button; on press it calls `submit()` on the
 * current step. The step validates its own input, shows inline errors,
 * moves focus to the first problem and commits valid answers to the flow.
 *
 * Steps provide it with `{ provide: OnboardingStepForm, useExisting: MyStep }`.
 */
export abstract class OnboardingStepForm {
  /** Replaces the step's default primary action label while set (e.g. "Try again"). */
  readonly primaryLabel?: Signal<string | null>;
  /** True while the step is working (e.g. uploading): the primary action is disabled. */
  readonly busy?: Signal<boolean>;
  /** True when the step offers its own choices instead (the account gate while signed out): the primary action is hidden. */
  readonly primaryHidden?: Signal<boolean>;

  /** Returns true when the step's answers are valid and committed. */
  abstract submit(): boolean;
}

/** Id of each step's main heading; also used to label its controls. */
export const STEP_HEADING_ID = 'onboarding-step-heading';
