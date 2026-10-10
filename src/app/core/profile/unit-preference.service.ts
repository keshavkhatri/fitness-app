import { Injectable, inject } from '@angular/core';

import { UnitSystem, UserFitnessProfile } from '../../domain/fitness-profile';
import { CLOCK } from '../time/clock';
import { FitnessProfileService } from './fitness-profile.service';
import { OnboardingStatusService } from './onboarding-status.service';

export type UnitPreferenceResult =
  | { readonly ok: true; readonly kind: 'updated' | 'unchanged' }
  | { readonly ok: false; readonly kind: 'no-profile' | 'save-failed' };

/**
 * Changes the profile's display units. Body values are stored in metric, so
 * nothing is converted and the plan is kept (units aren't a programming input).
 *
 * The save stamps a new `updatedAt`, which would normally send the user back
 * to the assessment; units don't change any assessment result, so a reviewed
 * assessment is recorded as reviewed for the new version too.
 */
@Injectable({ providedIn: 'root' })
export class UnitPreferenceService {
  private readonly profiles = inject(FitnessProfileService);
  private readonly onboarding = inject(OnboardingStatusService);
  private readonly clock = inject(CLOCK);
  private queue: Promise<unknown> = Promise.resolve();

  set(unitSystem: UnitSystem): Promise<UnitPreferenceResult> {
    const next = this.queue.then(() => this.apply(unitSystem));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async apply(unitSystem: UnitSystem): Promise<UnitPreferenceResult> {
    let profile: UserFitnessProfile | null;
    try {
      // Read-modify-write on the saved copy, not a possibly stale cache.
      profile = await this.profiles.refresh();
    } catch {
      return { ok: false, kind: 'save-failed' };
    }
    if (!profile) {
      return { ok: false, kind: 'no-profile' };
    }
    if (profile.unitSystem === unitSystem) {
      return { ok: true, kind: 'unchanged' };
    }
    const wasReviewed = (await this.onboarding.status()) === 'complete';
    const updated = { ...profile, unitSystem, updatedAt: this.clock().toISOString() };
    try {
      await this.profiles.save(updated);
    } catch {
      return { ok: false, kind: 'save-failed' };
    }
    if (wasReviewed) {
      await this.onboarding.markAssessmentReviewed(updated);
    }
    return { ok: true, kind: 'updated' };
  }
}
