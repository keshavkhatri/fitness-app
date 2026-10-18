import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { canAccess } from '../../../core/entitlements/access-policy';
import { EntitlementService } from '../../../core/entitlements/entitlement.service';
import { OFFER_PATH } from '../../../core/profile/onboarding.guards';
import { WORKOUT_PATH } from '../workout-paths';

/**
 * Building or editing a custom plan is Premium. The entitlement is re-read first (never trusted from
 * "loading"); anyone the access policy doesn't allow goes to the plan offer, which says plainly whether
 * Premium can be bought, and comes back to the workout tab.
 */
export const requireCustomPlanAccess: CanActivateFn = async () => {
  const entitlements = inject(EntitlementService);
  const router = inject(Router);
  await entitlements.refresh();
  return canAccess('custom-workout-plan', entitlements.plan()) || router.createUrlTree([OFFER_PATH], { queryParams: { next: WORKOUT_PATH } });
};
