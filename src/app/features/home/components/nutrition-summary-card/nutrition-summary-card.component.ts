import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { FitnessCardComponent, FitnessProgressComponent } from '../../../../shared/ui';
import { NutritionDaySummary } from '../../home.models';

@Component({
  selector: 'app-nutrition-summary-card',
  templateUrl: './nutrition-summary-card.component.html',
  styleUrl: './nutrition-summary-card.component.scss',
  imports: [DecimalPipe, FitnessCardComponent, FitnessProgressComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NutritionSummaryCardComponent {
  readonly nutrition = input.required<NutritionDaySummary>();

  protected readonly caloriesDelta = computed(
    () => this.nutrition().caloriesTarget - this.nutrition().caloriesConsumed,
  );
  protected readonly isOverTarget = computed(() => this.caloriesDelta() < 0);
  /** Calories left, or calories over target when `isOverTarget`. */
  protected readonly caloriesDeltaAmount = computed(() => Math.abs(this.caloriesDelta()));
}
