import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { FirstRunOfferService } from '../entitlements/first-run-offer.service';
import { FitnessProfileService } from './fitness-profile.service';
import { OnboardingStatus, OnboardingStatusService } from './onboarding-status.service';

export const ONBOARDING_PATH = '/onboarding';
export const ONBOARDING_REVIEW_PATH = '/onboarding/review';
export const ASSESSMENT_PATH = '/assessment';
export const HOME_PATH = '/home';
/** Free or Premium: once at the end of first-run setup, and from You. */
export const OFFER_PATH = '/offer';

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

/**
 * The tab shell: setup complete, and (only for someone who has just finished first-run setup) the plan
 * offer seen once. The offer is never a gate for existing users, and never for the full-screen workout
 * routes, which use requireOnboardingComplete so an active workout is never interrupted.
 */
export const requireAppReady: CanActivateFn = async (_route, state) => {
  const status = inject(OnboardingStatusService);
  const offer = inject(FirstRunOfferService);
  const router = inject(Router);
  const current = await status.status();
  if (current !== 'complete') {
    return router.parseUrl(PATH_FOR_STATUS[current]);
  }
  return (await offer.isPending()) ? router.createUrlTree([OFFER_PATH], { queryParams: { next: state.url } }) : true;
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
