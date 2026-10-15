import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { MealView } from '../nutrition-view-model';
import { FoodThumbComponent } from './food-thumb.component';

/**
 * One meal of the day as a row: placeholder art, what was logged and the
 * subtotal. A meal with food expands to its entries (tap one to edit) and
 * Add food; an empty meal's row adds food straight away.
 */
@Component({
  selector: 'app-meal-section',
  templateUrl: './meal-section.component.html',
  styleUrl: './meal-section.component.scss',
  imports: [IonIcon, FoodThumbComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MealSectionComponent {
  readonly meal = input.required<MealView>();
  readonly addText = input.required<string>();

  readonly addFood = output<void>();
  readonly editFood = output<string>();

  /** UI state only. */
  readonly open = signal(false);
}
