import { ChangeDetectionStrategy, Component, computed, input, output, viewChild } from '@angular/core';

import { FoodEntryField, MEAL_CATEGORIES, QUANTITY_UNITS } from '../../../domain/nutrition';
import { ChoiceGroupComponent, ChoiceOption, TextFieldComponent } from '../../../shared/ui';
import { FoodFormErrors, FoodFormValues } from '../food-form';
import { MEAL_LABELS, NUTRITION_COPY, UNIT_LABELS } from '../nutrition-content';

export type FoodFormChange = { [K in keyof FoodFormValues]: { readonly field: K; readonly value: FoodFormValues[K] } }[keyof FoodFormValues];
type TextFieldName = Exclude<FoodEntryField, 'unit' | 'meal'>;

/**
 * Every value of a food typed in by hand: name, amount and unit, meal and
 * the nutrition of that amount. Presentational; the page owns the values,
 * validation and saving (`submitted` fires on Enter / a submit button
 * pointing at `formId`).
 */
@Component({
  selector: 'app-food-form',
  templateUrl: './food-form.component.html',
  styleUrl: './food-form.component.scss',
  imports: [ChoiceGroupComponent, TextFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoodFormComponent {
  readonly values = input.required<FoodFormValues>();
  readonly errors = input<FoodFormErrors>({});
  readonly formId = input('food-form');

  readonly changed = output<FoodFormChange>();
  readonly submitted = output<void>();

  protected readonly copy = NUTRITION_COPY.form;
  protected readonly unitOptions: readonly ChoiceOption<FoodFormValues['unit']>[] = QUANTITY_UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u].option }));
  protected readonly mealOptions: readonly ChoiceOption<FoodFormValues['meal']>[] = MEAL_CATEGORIES.map((m) => ({ value: m, label: MEAL_LABELS[m] }));

  private readonly nameField = viewChild<TextFieldComponent>('nameField');
  private readonly quantityField = viewChild<TextFieldComponent>('quantityField');
  private readonly caloriesField = viewChild<TextFieldComponent>('caloriesField');
  private readonly proteinField = viewChild<TextFieldComponent>('proteinField');
  private readonly carbsField = viewChild<TextFieldComponent>('carbsField');
  private readonly fatField = viewChild<TextFieldComponent>('fatField');
  private readonly fields = computed<Record<TextFieldName, TextFieldComponent | undefined>>(() => ({
    name: this.nameField(),
    quantity: this.quantityField(),
    calories: this.caloriesField(),
    proteinGrams: this.proteinField(),
    carbohydrateGrams: this.carbsField(),
    fatGrams: this.fatField(),
  }));

  protected change<K extends keyof FoodFormValues>(field: K, value: FoodFormValues[K]): void {
    this.changed.emit({ field, value } as FoodFormChange);
  }

  /** Moves focus to a field (the first with an error, after a failed save). */
  focus(field: FoodEntryField): void {
    if (field !== 'unit' && field !== 'meal') {
      this.fields()[field]?.focus();
    }
  }
}
