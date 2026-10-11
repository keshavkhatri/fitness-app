import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent, FitnessIconButtonComponent, FitnessProgressComponent } from '../../../../shared/ui';
import { DaySummaryView } from '../../../nutrition/nutrition-view-model';

/**
 * Home's compact nutrition card: today's protein as a ring, carbs and fat as
 * bars (calories are the "Your day" Fuel tile). Purely presentational: every
 * number comes formatted from Nutrition's view model (toDaySummary).
 */
@Component({
  selector: 'app-nutrition-summary-card',
  templateUrl: './nutrition-summary-card.component.html',
  styleUrl: './nutrition-summary-card.component.scss',
  imports: [IonIcon, FitnessCardComponent, FitnessIconButtonComponent, FitnessProgressComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NutritionSummaryCardComponent {
  readonly summary = input.required<DaySummaryView>();
  readonly headingId = input('home-nutrition');
  /** The Nutrition tab (the card's title, or "Review" when a target is withheld). */
  readonly openNutrition = output<void>();
  /** "Log food": today's new food entry. */
  readonly logFood = output<void>();

  protected readonly protein = computed(() => this.summary().macros.find((m) => m.key === 'protein')!);
  protected readonly others = computed(() => this.summary().macros.filter((m) => m.key !== 'protein'));
}
