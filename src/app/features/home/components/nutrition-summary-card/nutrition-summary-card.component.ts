import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { FitnessButtonComponent, FitnessCardComponent, FitnessProgressComponent } from '../../../../shared/ui';
import { DaySummaryView } from '../../../nutrition/nutrition-view-model';

/**
 * Today's calories and macros on Home. Purely presentational: every number
 * and balance comes formatted from Nutrition's view model (toDaySummary);
 * nothing is calculated here.
 */
@Component({
  selector: 'app-nutrition-summary-card',
  templateUrl: './nutrition-summary-card.component.html',
  styleUrl: './nutrition-summary-card.component.scss',
  imports: [FitnessButtonComponent, FitnessCardComponent, FitnessProgressComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NutritionSummaryCardComponent {
  readonly summary = input.required<DaySummaryView>();
  /** "Review in Nutrition" (shown when a target is withheld). */
  readonly openNutrition = output<void>();
}
