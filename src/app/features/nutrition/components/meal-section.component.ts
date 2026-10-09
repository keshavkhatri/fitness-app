import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent } from '../../../shared/ui';
import { MealView } from '../nutrition-view-model';

/** One meal of the day: subtotal, logged food (tap to edit) and Add Food. */
@Component({
  selector: 'app-meal-section',
  templateUrl: './meal-section.component.html',
  styleUrl: './meal-section.component.scss',
  imports: [IonIcon, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MealSectionComponent {
  readonly meal = input.required<MealView>();
  readonly addText = input.required<string>();

  readonly addFood = output<void>();
  readonly editFood = output<string>();
}
