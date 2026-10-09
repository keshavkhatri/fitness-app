import { Injectable, inject } from '@angular/core';

import { FitnessAssessment, calculateFitnessAssessment } from '../../domain/fitness-calculations';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { CLOCK, localIsoDate } from '../time/clock';
import { FITNESS_CALCULATION_CONFIG } from './calculation-config.token';

export type CurrentAssessment =
  | { readonly kind: 'ready'; readonly profile: UserFitnessProfile; readonly assessment: FitnessAssessment }
  | { readonly kind: 'no-profile' }
  /** The engine rejected the profile (incomplete/invalid) or the configuration. */
  | { readonly kind: 'unavailable' };

/**
 * The single app-level entry point to the fitness calculation engine:
 * the current stored profile, calculated on the user's local calendar date
 * with the injected configuration. Computed on demand (never stored), so
 * consumers always get targets for the current profile.
 *
 * Used by the assessment screen and by Nutrition; no formulas live here.
 */
@Injectable({ providedIn: 'root' })
export class FitnessAssessmentService {
  private readonly profiles = inject(FitnessProfileService);
  private readonly config = inject(FITNESS_CALCULATION_CONFIG);
  private readonly clock = inject(CLOCK);

  async current(): Promise<CurrentAssessment> {
    const profile = await this.profiles.load();
    if (!profile) {
      return { kind: 'no-profile' };
    }
    const result = calculateFitnessAssessment(profile, { asOfDate: localIsoDate(this.clock()), config: this.config });
    return result.ok ? { kind: 'ready', profile, assessment: result.value } : { kind: 'unavailable' };
  }
}
