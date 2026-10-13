import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent, FitnessProgressComponent } from '../../../../shared/ui';
import { DaySummaryView } from '../../../nutrition/nutrition-view-model';

/**
 * Home's compact nutrition card: today's protein as a ring and calories
 * against the target. The whole card opens Nutrition. Purely presentational:
 * every number comes formatted from Nutrition's view model (toDaySummary).
 */
@Component({
  selector: 'app-nutrition-summary-card',
  templateUrl: './nutrition-summary-card.component.html',
  styleUrl: './nutrition-summary-card.component.scss',
  imports: [IonIcon, FitnessCardComponent, FitnessProgressComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NutritionSummaryCardComponent {
  readonly summary = input.required<DaySummaryView>();
  readonly headingId = input('home-nutrition');
  /** The Nutrition tab (the whole card, or "Review" when a target is withheld). */
  readonly openNutrition = output<void>();

  protected readonly protein = computed(() => this.summary().macros.find((m) => m.key === 'protein')!);
  /** "78 g" → "78g", as in the compact reference layout. */
  protected tight(value: string | null): string {
    return (value ?? '').replace(/\s(?=g$)/, '');
  }
}
