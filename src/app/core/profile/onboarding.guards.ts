import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { FitnessProfileService } from './fitness-profile.service';

export const ONBOARDING_PATH = '/onboarding';
export const HOME_PATH = '/home';

/** Main app requires a completed profile; otherwise send the user to onboarding. */
export const requireOnboardingComplete: CanActivateFn = async () => {
  const profiles = inject(FitnessProfileService);
  const router = inject(Router);
  return (await profiles.hasCompletedOnboarding()) || router.parseUrl(ONBOARDING_PATH);
};

/** Onboarding is only shown once; completed users go straight to Home. */
export const redirectIfOnboarded: CanActivateFn = async () => {
  const profiles = inject(FitnessProfileService);
  const router = inject(Router);
  return (await profiles.hasCompletedOnboarding()) ? router.parseUrl(HOME_PATH) : true;
};
