import { Injectable, inject } from '@angular/core';

import { FITNESS_CALCULATION_CONFIG } from '../../core/calculations/calculation-config.token';
import { FitnessAssessmentService } from '../../core/calculations/fitness-assessment.service';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { AssessmentViewModel, toAssessmentViewModel } from './assessment-view-model';

export type AssessmentScreen =
  | { readonly kind: 'ready'; readonly profile: UserFitnessProfile; readonly view: AssessmentViewModel }
  /** No profile, or the engine rejected it as incomplete/invalid. */
  | { readonly kind: 'incomplete' };

/**
 * Profile → calculation engine (via FitnessAssessmentService) → view model.
 * Calculates locally from the canonical stored profile on the user's local
 * calendar date. No formulas here.
 */
@Injectable()
export class AssessmentService {
  private readonly assessments = inject(FitnessAssessmentService);
  private readonly config = inject(FITNESS_CALCULATION_CONFIG);

  async load(): Promise<AssessmentScreen> {
    const current = await this.assessments.current();
    if (current.kind !== 'ready') {
      return { kind: 'incomplete' };
    }
    return { kind: 'ready', profile: current.profile, view: toAssessmentViewModel(current.profile, current.assessment, this.config) };
  }
}
