import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { FitnessProfileService } from './fitness-profile.service';
import { OnboardingStatus, OnboardingStatusService } from './onboarding-status.service';

export const ONBOARDING_PATH = '/onboarding';
export const ONBOARDING_REVIEW_PATH = '/onboarding/review';
export const ASSESSMENT_PATH = '/assessment';
export const HOME_PATH = '/home';

const PATH_FOR_STATUS: Record<OnboardingStatus, string> = {
  'needs-onboarding': ONBOARDING_PATH,
  'needs-assessment': ASSESSMENT_PATH,
  complete: HOME_PATH,
};

/**
 * Main app (tab shell): requires a profile AND a reviewed assessment.
 * Otherwise sends the user to whichever first-run step is outstanding.
 */
export const requireOnboardingComplete: CanActivateFn = async () => {
  const status = inject(OnboardingStatusService);
  const router = inject(Router);
  const current = await status.status();
  return current === 'complete' || router.parseUrl(PATH_FOR_STATUS[current]);
};

/** New-user onboarding is only shown until a profile exists. */
export const redirectIfOnboarded: CanActivateFn = async () => {
  const status = inject(OnboardingStatusService);
  const router = inject(Router);
  const current = await status.status();
  return current === 'needs-onboarding' || router.parseUrl(PATH_FOR_STATUS[current]);
};

/** Screens that work on an existing profile (assessment, profile review). */
export const requireProfile: CanActivateFn = async () => {
  const profiles = inject(FitnessProfileService);
  const router = inject(Router);
  return (await profiles.hasCompletedOnboarding()) || router.parseUrl(ONBOARDING_PATH);
};
