import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, linkedSignal, resource, signal, viewChild } from '@angular/core';
import { IonBackButton, IonContent, IonFooter, IonIcon, NavController } from '@ionic/angular';

import { NutritionService } from '../../core/nutrition/nutrition.service';
import { ThemeService } from '../../core/theme/theme.service';
import { CLOCK } from '../../core/time/clock';
import { IsoCalendarDate, parseIsoCalendarDate } from '../../domain/fitness-profile';
import { FoodEntry, FoodEntryField, MEAL_CATEGORIES, MealCategory, inputOf, isMealCategory, validateFoodEntryInput } from '../../domain/nutrition';
import { EmptyStateComponent, FitnessButtonComponent, LoadingSkeletonComponent, SegmentOption, SegmentedControlComponent } from '../../shared/ui';
import { RecentFoodRowView, searchFoods, toRecentFoodRow } from './add-food-view-model';
import { FoodFormChange, FoodFormComponent } from './components/food-form.component';
import { RecentFoodListComponent } from './components/recent-food-list.component';
import { FoodFormErrors, FoodFormValues, emptyFoodForm, foodFormFromRecent, formErrorsOf, readFoodForm } from './food-form';
import { MEAL_LABELS, NUTRITION_COPY } from './nutrition-content';
import { NUTRITION_PATH } from './nutrition-paths';
import { suggestedMeal, toDateHeader } from './nutrition-view-model';

/** Recent foods offered for search (the 30-day window, de-duplicated). */
export const RECENT_SEARCH_LIMIT = 50;
/** After a one-tap add, the row shows a check and ignores taps this long (a double tap never logs twice). */
export const ADDED_COOLDOWN_MS = 1500;

const FIELD_ORDER: readonly FoodEntryField[] = ['name', 'quantity', 'unit', 'meal', 'calories', 'proteinGrams', 'carbohydrateGrams', 'fatGrams'];

type Recent = { readonly ok: true; readonly foods: readonly FoodEntry[] } | { readonly ok: false };

/**
 * Add Food (immersive, always dark), for the day and meal it was opened for
 * (`/nutrition/food/new?meal=lunch&date=2026-10-08`).
 *
 * Search covers the user's own Recent foods only; there is no food database
 * or barcode scanning. "+" logs a recent food again as it was, in one tap,
 * staying here to add more; tapping the food opens it in the form to change
 * first. "Enter food manually" types a new one in. Every save goes through
 * NutritionService, and nothing is shown as added until storage confirmed it.
 */
@Component({
  selector: 'app-add-food',
  templateUrl: './add-food.page.html',
  styleUrl: './add-food.page.scss',
  host: { class: 'fit-theme-immersive' },
  imports: [
    IonBackButton,
    IonContent,
    IonFooter,
    IonIcon,
    EmptyStateComponent,
    FitnessButtonComponent,
    LoadingSkeletonComponent,
    SegmentedControlComponent,
    FoodFormComponent,
    RecentFoodListComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddFoodPage {
  /** Query parameters. */
  readonly meal = input<string>();
  readonly date = input<string>();

  private readonly nutrition = inject(NutritionService);
  private readonly nav = inject(NavController);
  private readonly clock = inject(CLOCK);

  protected readonly copy = NUTRITION_COPY.add;
  protected readonly formCopy = NUTRITION_COPY.form;
  protected readonly nutritionPath = NUTRITION_PATH;
  protected readonly mealOptions: readonly SegmentOption<MealCategory>[] = MEAL_CATEGORIES.map((m) => ({ value: m, label: MEAL_LABELS[m] }));

  /** The day being logged: a valid date not after today (else today). */
  protected readonly day = computed<IsoCalendarDate>(() => {
    const today = this.nutrition.today();
    const date = this.date();
    return date && parseIsoCalendarDate(date) && date <= today ? date : today;
  });
  protected readonly dayLabel = computed(() => toDateHeader(this.day(), this.nutrition.today()).label);
  /** "today", "yesterday", "Monday, Oct 5" (inside a sentence). */
  protected readonly dayPhrase = computed(() => {
    const label = this.dayLabel();
    return /^(Today|Yesterday)$/.test(label) ? label.toLowerCase() : label;
  });

  /** The meal added to: from the link, else by time of day; the user can change it. */
  protected readonly selectedMeal = linkedSignal<MealCategory>(() => {
    const meal = this.meal();
    return meal && isMealCategory(meal) ? meal : suggestedMeal(this.clock());
  });
  protected readonly mealLabel = computed(() => MEAL_LABELS[this.selectedMeal()]);

  // --- Search -----------------------------------------------------------------------------------
  private readonly recent = resource({
    loader: async (): Promise<Recent> => {
      try {
        return { ok: true, foods: await this.nutrition.recentFoods(RECENT_SEARCH_LIMIT) };
      } catch {
        return { ok: false };
      }
    },
  });
  protected readonly query = signal('');
  /** null while loading. */
  protected readonly recentState = computed<Recent | null>(() => (this.recent.hasValue() ? this.recent.value() : this.recent.error() ? { ok: false } : null));
  protected readonly rows = computed<readonly RecentFoodRowView[]>(() => {
    const r = this.recentState();
    return r?.ok ? searchFoods(r.foods, this.query()).map((f) => toRecentFoodRow(f, this.selectedMeal())) : [];
  });
  /** Rows being saved (no double add while one is in flight). */
  protected readonly pending = signal<ReadonlySet<string>>(new Set());
  /** Rows just added (a check replaces the + for ADDED_COOLDOWN_MS; taps are ignored meanwhile). */
  protected readonly added = signal<ReadonlySet<string>>(new Set());
  /** Announced after an add (or a failed one). */
  protected readonly feedback = signal<{ readonly text: string; readonly ok: boolean } | null>(null);

  // --- Manual / change-first form ----------------------------------------------------------------
  protected readonly mode = signal<'search' | 'form'>('search');
  protected readonly form = signal<FoodFormValues>(emptyFoodForm('breakfast'));
  protected readonly errors = signal<FoodFormErrors>({});
  protected readonly saving = signal(false);
  protected readonly status = signal('');
  private readonly formView = viewChild(FoodFormComponent);

  constructor() {
    // Light status-bar text while this always-dark screen is open.
    const releaseStatusBar = inject(ThemeService).holdAlwaysDark();
    inject(DestroyRef).onDestroy(releaseStatusBar);
  }

  protected setQuery(value: string): void {
    this.query.set(value);
  }

  protected clearQuery(input: HTMLInputElement): void {
    this.query.set('');
    input.focus();
  }

  protected retryRecent(): void {
    this.recent.reload();
  }

  /** One tap: the recent food logged again as it was, to the chosen meal and day. */
  protected async quickAdd(row: RecentFoodRowView): Promise<void> {
    if (this.pending().has(row.id) || this.added().has(row.id)) {
      return; // no double add, while saving or straight after
    }
    this.pending.update((p) => new Set(p).add(row.id));
    const meal = this.selectedMeal();
    try {
      const result = await this.nutrition.add({ ...inputOf(row.entry), meal }, this.day());
      if (result.ok) {
        this.showDay(result.entry.date);
        this.added.update((a) => new Set(a).add(row.id));
        setTimeout(() => this.added.update((a) => {
          const next = new Set(a);
          next.delete(row.id);
          return next;
        }), ADDED_COOLDOWN_MS);
        this.feedback.set({ text: this.copy.added(row.name, MEAL_LABELS[meal], this.dayPhrase()), ok: true });
      } else {
        this.feedback.set({ text: this.copy.addFailed(row.name), ok: false });
      }
    } finally {
      this.pending.update((p) => {
        const next = new Set(p);
        next.delete(row.id);
        return next;
      });
    }
  }

  /** Change a recent food before adding: the form, filled in. */
  protected review(row: RecentFoodRowView): void {
    this.openForm(foodFormFromRecent(row.entry, this.selectedMeal()));
  }

  protected enterManually(): void {
    this.openForm(emptyFoodForm(this.selectedMeal()));
  }

  protected backToSearch(): void {
    if (!this.saving()) {
      this.mode.set('search');
      this.status.set('');
    }
  }

  protected update(change: FoodFormChange): void {
    this.form.update((f) => ({ ...f, [change.field]: change.value }));
    if (change.field === 'meal') {
      this.selectedMeal.set(change.value as MealCategory);
    }
    if (this.errors()[change.field]) {
      this.errors.update(({ [change.field]: _, ...rest }) => rest);
    }
  }

  protected async save(): Promise<void> {
    if (this.saving()) {
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
      const result = await this.nutrition.add(input, this.day());
      if (result.ok) {
        this.errors.set({});
        this.showDay(result.entry.date);
        void this.nav.navigateBack(NUTRITION_PATH);
        return;
      }
      if (result.kind === 'invalid') {
        this.showErrors(formErrorsOf(result.errors));
      } else {
        this.status.set(this.formCopy.saveFailed);
      }
    } finally {
      this.saving.set(false);
    }
  }

  private openForm(values: FoodFormValues): void {
    this.form.set(values);
    this.errors.set({});
    this.status.set('');
    this.mode.set('form');
  }

  /** Opened for another day than Nutrition shows (e.g. from Quick Add): Nutrition shows the logged day. */
  private showDay(date: IsoCalendarDate): void {
    if (this.nutrition.selectedDate() !== date) {
      void this.nutrition.load(date);
    }
  }

  private showErrors(errors: FoodFormErrors): void {
    this.errors.set(errors);
    this.status.set(this.formCopy.fixErrors);
    const first = FIELD_ORDER.find((f) => errors[f]);
    if (first) {
      this.formView()?.focus(first);
    }
  }
}
