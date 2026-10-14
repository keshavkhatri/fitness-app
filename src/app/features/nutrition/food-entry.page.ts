import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, resource, signal, viewChild } from '@angular/core';
import { IonContent, IonFooter, IonIcon, NavController } from '@ionic/angular';

import { NutritionService } from '../../core/nutrition/nutrition.service';
import { IsoCalendarDate, parseIsoCalendarDate } from '../../domain/fitness-profile';
import {
  FoodEntry,
  FoodEntryField,
  MEAL_CATEGORIES,
  MealCategory,
  SERVINGS_MAX,
  SERVINGS_MIN,
  portionInput,
  stepServings,
  validateFoodEntryInput,
} from '../../domain/nutrition';
import {
  BottomSheetComponent,
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  SegmentOption,
  SegmentedControlComponent,
  TextFieldComponent,
} from '../../shared/ui';
import { FoodFormChange, FoodFormComponent } from './components/food-form.component';
import { FoodThumbComponent } from './components/food-thumb.component';
import { NutrientRowComponent } from './components/nutrient-row.component';
import { spokenNutrients, toPortionView } from './edit-food-view-model';
import { FoodFormErrors, FoodFormValues, foodFormOf, formErrorsOf, readFoodForm } from './food-form';
import { MEAL_LABELS, NUTRITION_COPY, UNIT_LABELS } from './nutrition-content';
import { NUTRITION_PATH } from './nutrition-paths';
import { toDateHeader } from './nutrition-view-model';

type Loaded = { readonly kind: 'edit'; readonly entry: FoodEntry } | { readonly kind: 'not-found' } | { readonly kind: 'error' };

const FIELD_ORDER: readonly FoodEntryField[] = ['name', 'quantity', 'unit', 'meal', 'calories', 'proteinGrams', 'carbohydrateGrams', 'fatGrams'];

/**
 * Edit one logged food (`/nutrition/food/:entryId?date=…`), always the same
 * entry: saving updates it in place and Delete removes it after a
 * confirmation. The portion is a serving size in the entry's own unit eaten
 * a number of times, with live per-serving and total values scaled from what
 * was recorded (domain: foodPortion). "Edit name and nutrition values"
 * switches to the full form for anything else (name, unit, typed values).
 * Nothing is shown as saved or deleted until storage confirmed it.
 */
@Component({
  selector: 'app-food-entry',
  templateUrl: './food-entry.page.html',
  styleUrl: './food-entry.page.scss',
  host: { class: 'fit-theme-dashboard' },
  imports: [
    IonContent,
    IonFooter,
    IonIcon,
    BottomSheetComponent,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    SegmentedControlComponent,
    TextFieldComponent,
    FoodFormComponent,
    FoodThumbComponent,
    NutrientRowComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoodEntryPage {
  /** Route parameter. */
  readonly entryId = input.required<string>();
  /** Query parameter: the entry's day. */
  readonly date = input<string>();

  private readonly nutrition = inject(NutritionService);
  private readonly nav = inject(NavController);

  protected readonly copy = NUTRITION_COPY.form;
  protected readonly servingsMin = SERVINGS_MIN;
  protected readonly servingsMax = SERVINGS_MAX;
  protected readonly mealOptions: readonly SegmentOption<MealCategory>[] = MEAL_CATEGORIES.map((m) => ({ value: m, label: MEAL_LABELS[m] }));

  /** The entry's day: a valid date not after today (else today). */
  protected readonly day = computed<IsoCalendarDate>(() => {
    const today = this.nutrition.today();
    const date = this.date();
    return date && parseIsoCalendarDate(date) && date <= today ? date : today;
  });
  protected readonly dayLabel = computed(() => toDateHeader(this.day(), this.nutrition.today()).label);

  private readonly state = resource({
    params: () => ({ id: this.entryId(), date: this.day() }),
    loader: async ({ params }): Promise<Loaded> => {
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

  // --- Portion ------------------------------------------------------------------------------------
  protected readonly mode = signal<'portion' | 'details'>('portion');
  /** The serving size as typed, in the entry's unit; starts at the recorded amount. */
  protected readonly servingText = linkedSignal(() => String(this.editing()?.quantity ?? ''));
  /** Resets to one serving whenever another entry is loaded. */
  protected readonly servings = linkedSignal<FoodEntry | null, number>({ source: this.editing, computation: () => 1 });
  protected readonly meal = linkedSignal<MealCategory>(() => this.editing()?.meal ?? 'breakfast');
  protected readonly mealLabel = computed(() => MEAL_LABELS[this.meal()]);
  protected readonly unit = computed(() => {
    const entry = this.editing();
    return entry ? UNIT_LABELS[entry.unit] : null;
  });
  protected readonly portion = computed(() => {
    const entry = this.editing();
    return entry ? toPortionView(entry, this.servingText(), this.servings()) : null;
  });
  protected readonly totalSpoken = computed(() => {
    const p = this.portion()?.portion;
    return p ? spokenNutrients(this.copy.total, p.total) : this.copy.totalUnavailable;
  });
  /** Shown after a failed Save, under the serving size. */
  protected readonly showServingError = signal(false);

  // --- Details (full form) ------------------------------------------------------------------------
  protected readonly form = signal<FoodFormValues | null>(null);
  protected readonly errors = signal<FoodFormErrors>({});
  private readonly formView = viewChild(FoodFormComponent);
  private readonly servingField = viewChild<TextFieldComponent>('servingField');

  protected readonly saving = signal(false);
  /** Announced above Save: validation summary or a failed save/delete. */
  protected readonly status = signal('');
  protected readonly confirmOpen = signal(false);

  protected setServingText(value: string): void {
    this.servingText.set(value);
    this.showServingError.set(false);
  }

  protected step(direction: 1 | -1): void {
    this.servings.update((s) => stepServings(s, direction));
  }

  /** The full form, filled in with the current portion (or the entry when the portion isn't valid). */
  protected editDetails(): void {
    const entry = this.editing();
    const p = this.portion()?.portion;
    if (!entry || this.saving()) {
      return;
    }
    const base = foodFormOf(entry);
    this.form.set(
      p
        ? {
            ...base,
            meal: this.meal(),
            quantity: String(p.quantity),
            calories: String(p.total.calories),
            proteinGrams: String(p.total.proteinGrams),
            carbohydrateGrams: String(p.total.carbohydrateGrams),
            fatGrams: String(p.total.fatGrams),
          }
        : { ...base, meal: this.meal() },
    );
    this.errors.set({});
    this.status.set('');
    this.mode.set('details');
  }

  protected updateForm(change: FoodFormChange): void {
    this.form.update((f) => (f ? { ...f, [change.field]: change.value } : f));
    if (this.errors()[change.field]) {
      this.errors.update(({ [change.field]: _, ...rest }) => rest);
    }
  }

  protected async save(): Promise<void> {
    const entry = this.editing();
    if (this.saving() || !entry) {
      return; // no double submit
    }
    this.saving.set(true);
    this.status.set('');
    try {
      const form = this.form();
      let input;
      if (this.mode() === 'details' && form) {
        const read = readFoodForm(form);
        if (Object.keys(read.formatErrors).length > 0) {
          // Nothing is sent for saving while a number is ambiguous.
          this.showErrors(formErrorsOf(validateFoodEntryInput(read.input), read.formatErrors));
          return;
        }
        input = read.input;
      } else {
        const p = this.portion()?.portion;
        if (!p) {
          this.showServingError.set(true);
          this.status.set(this.copy.fixErrors);
          this.servingField()?.focus();
          return;
        }
        input = portionInput(entry, p, this.meal());
      }
      // The same entry is updated (same id, day and creation time); never a copy.
      const result = await this.nutrition.update(entry, input);
      if (result.ok) {
        this.errors.set({});
        if (this.nutrition.selectedDate() !== result.entry.date) {
          void this.nutrition.load(result.entry.date);
        }
        void this.nav.navigateBack(NUTRITION_PATH);
        return;
      }
      if (result.kind === 'invalid') {
        if (this.mode() === 'portion') {
          this.editDetails();
        }
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

  protected close(): void {
    void this.nav.navigateBack(NUTRITION_PATH);
  }

  private showErrors(errors: FoodFormErrors): void {
    this.errors.set(errors);
    this.status.set(this.copy.fixErrors);
    const first = FIELD_ORDER.find((f) => errors[f]);
    if (first) {
      this.formView()?.focus(first);
    }
  }
}
