import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, resource, signal, viewChild } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonFooter, IonHeader, IonTitle, IonToolbar, NavController } from '@ionic/angular';

import { NutritionService } from '../../core/nutrition/nutrition.service';
import { CLOCK } from '../../core/time/clock';
import { IsoCalendarDate, parseIsoCalendarDate } from '../../domain/fitness-profile';
import { FoodEntry, FoodEntryField, MEAL_CATEGORIES, QUANTITY_UNITS, isMealCategory, validateFoodEntryInput } from '../../domain/nutrition';
import {
  BottomSheetComponent,
  ChoiceGroupComponent,
  ChoiceOption,
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  TextFieldComponent,
} from '../../shared/ui';
import { FoodFormErrors, FoodFormValues, emptyFoodForm, foodFormOf, formErrorsOf, readFoodForm } from './food-form';
import { MEAL_LABELS, NUTRITION_COPY, UNIT_LABELS } from './nutrition-content';
import { NUTRITION_PATH } from './nutrition-paths';
import { suggestedMeal, toDateHeader } from './nutrition-view-model';

type Loaded =
  | { readonly kind: 'new' }
  | { readonly kind: 'edit'; readonly entry: FoodEntry }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'error' };

type TextFieldName = Exclude<FoodEntryField, 'unit' | 'meal'>;
const FIELD_ORDER: readonly FoodEntryField[] = ['name', 'quantity', 'unit', 'meal', 'calories', 'proteinGrams', 'carbohydrateGrams', 'fatGrams'];

/**
 * Add or edit one logged food, with values typed in manually.
 * `/nutrition/food/new?meal=lunch&date=2026-10-08` or `/nutrition/food/:entryId?date=…`.
 * Nothing is shown as saved or deleted until storage confirmed it.
 */
@Component({
  selector: 'app-food-entry',
  templateUrl: './food-entry.page.html',
  styleUrl: './food-entry.page.scss',
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonFooter,
    BottomSheetComponent,
    ChoiceGroupComponent,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoodEntryPage {
  /** Route parameter; absent when adding. */
  readonly entryId = input<string>();
  /** Query parameters. */
  readonly meal = input<string>();
  readonly date = input<string>();

  private readonly nutrition = inject(NutritionService);
  private readonly nav = inject(NavController);
  private readonly clock = inject(CLOCK);

  protected readonly copy = NUTRITION_COPY.form;
  protected readonly nutritionPath = NUTRITION_PATH;
  protected readonly unitOptions: readonly ChoiceOption<FoodFormValues['unit']>[] = QUANTITY_UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u].option }));
  protected readonly mealOptions: readonly ChoiceOption<FoodFormValues['meal']>[] = MEAL_CATEGORIES.map((m) => ({ value: m, label: MEAL_LABELS[m] }));

  /** The day being logged: a valid date not after today (else today). */
  protected readonly day = computed<IsoCalendarDate>(() => {
    const today = this.nutrition.today();
    const date = this.date();
    return date && parseIsoCalendarDate(date) && date <= today ? date : today;
  });
  protected readonly dayLabel = computed(() => toDateHeader(this.day(), this.nutrition.today()).label);

  private readonly state = resource({
    params: () => ({ id: this.entryId(), date: this.day() }),
    loader: async ({ params }): Promise<Loaded> => {
      if (!params.id) {
        return { kind: 'new' };
      }
      const found = await this.nutrition.findEntry(params.date, params.id);
      return found === 'error' ? { kind: 'error' } : found ? { kind: 'edit', entry: found } : { kind: 'not-found' };
    },
  });

  /** null while loading. */
  protected readonly loaded = computed<Loaded | null>(() => (this.state.hasValue() ? this.state.value() : this.state.error() ? { kind: 'error' } : null));
  protected readonly editing = computed(() => {
    const l = this.loaded();
    return l?.kind === 'edit' ? l.entry : null;
  });
  protected readonly title = computed(() => (this.entryId() ? this.copy.editTitle : this.copy.addTitle));

  protected readonly form = linkedSignal<FoodFormValues>(() => {
    const entry = this.editing();
    const meal = this.meal();
    return entry ? foodFormOf(entry) : emptyFoodForm(meal && isMealCategory(meal) ? meal : suggestedMeal(this.clock()));
  });
  protected readonly errors = signal<FoodFormErrors>({});
  protected readonly saving = signal(false);
  /** Announced above Save: validation summary or a failed save/delete. */
  protected readonly status = signal('');
  protected readonly confirmOpen = signal(false);

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

  protected update<K extends keyof FoodFormValues>(field: K, value: FoodFormValues[K]): void {
    this.form.update((f) => ({ ...f, [field]: value }));
    if (this.errors()[field]) {
      this.errors.update(({ [field]: _, ...rest }) => rest);
    }
  }

  protected async save(): Promise<void> {
    const loaded = this.loaded();
    if (this.saving() || !loaded || (loaded.kind !== 'new' && loaded.kind !== 'edit')) {
      return; // no double submit
    }
    this.saving.set(true);
    this.status.set('');
    try {
      const { input, formatErrors } = readFoodForm(this.form());
      if (Object.keys(formatErrors).length > 0) {
        // Nothing is sent for saving while a number is ambiguous.
        this.showErrors(formErrorsOf(validateFoodEntryInput(input), formatErrors));
        return;
      }
      const result = loaded.kind === 'edit' ? await this.nutrition.update(loaded.entry, input) : await this.nutrition.add(input, this.day());
      if (result.ok) {
        this.errors.set({});
        if (this.nutrition.selectedDate() !== result.entry.date) {
          // Opened for another day than Nutrition shows (e.g. from Quick Add): show the logged day.
          void this.nutrition.load(result.entry.date);
        }
        void this.nav.navigateBack(NUTRITION_PATH);
        return;
      }
      if (result.kind === 'invalid') {
        this.showErrors(formErrorsOf(result.errors));
      } else {
        this.status.set(this.copy.saveFailed);
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected askDelete(): void {
    if (!this.saving()) {
      this.confirmOpen.set(true);
    }
  }

  protected cancelDelete(): void {
    this.confirmOpen.set(false);
  }

  protected async confirmDelete(): Promise<void> {
    const entry = this.editing();
    this.confirmOpen.set(false);
    if (!entry || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.status.set('');
    try {
      if ((await this.nutrition.remove(entry)).ok) {
        void this.nav.navigateBack(NUTRITION_PATH);
      } else {
        this.status.set(this.copy.deleteFailed);
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected retry(): void {
    this.state.reload();
  }

  protected backToNutrition(): void {
    void this.nav.navigateBack(NUTRITION_PATH);
  }

  private showErrors(errors: FoodFormErrors): void {
    this.errors.set(errors);
    this.status.set(this.copy.fixErrors);
    this.focusFirstError();
  }

  private focusFirstError(): void {
    const first = FIELD_ORDER.find((f) => this.errors()[f]);
    if (first && first !== 'unit' && first !== 'meal') {
      this.fields()[first]?.focus();
    }
  }
}
