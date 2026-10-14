import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { IonBackButton, IonIcon, NavController } from '@ionic/angular';

import { NutritionService } from '../../core/nutrition/nutrition.service';
import { IsoCalendarDate } from '../../domain/fitness-profile';
import { shiftWeek, weekStartOf } from '../../domain/nutrition';
import {
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  PageLayoutComponent,
  SegmentOption,
  SegmentedControlComponent,
} from '../../shared/ui';
import { WeekAveragesComponent } from './components/week-averages.component';
import { WeekBarChartComponent } from './components/week-bar-chart.component';
import { WeekDayListComponent } from './components/week-day-list.component';
import { WeekMetric, toWeekChart } from './nutrition-week-chart';
import { NUTRITION_COPY } from './nutrition-content';
import { NEW_FOOD_PATH, NUTRITION_PATH } from './nutrition-paths';
import { NutritionWeekScreen, toNutritionWeekScreen } from './nutrition-week-view-model';
import { suggestedMeal } from './nutrition-view-model';
import { CLOCK } from '../../core/time/clock';

type MacroMetric = Exclude<WeekMetric, 'calories'>;

/**
 * One Monday–Sunday week of logged food: calories by day against the daily
 * target, the daily average over logged days (with % of target where a
 * target exists), a chosen macro by day, the total and a day-by-day list.
 * Days without entries are never counted as zero. Read-only; a day opens in
 * the food log, and "Day" returns to it.
 */
@Component({
  selector: 'app-nutrition-week',
  templateUrl: './nutrition-week.page.html',
  styleUrl: './nutrition-week.page.scss',
  host: { class: 'fit-theme-dashboard' },
  imports: [
    IonBackButton,
    IonIcon,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    PageLayoutComponent,
    SegmentedControlComponent,
    WeekAveragesComponent,
    WeekBarChartComponent,
    WeekDayListComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NutritionWeekPage {
  /** Query parameter: a date in the week to open first (default: this week). */
  readonly date = input<string>();

  private readonly nutrition = inject(NutritionService);
  private readonly nav = inject(NavController);
  private readonly clock = inject(CLOCK);

  protected readonly copy = NUTRITION_COPY.week;
  protected readonly nutritionPath = NUTRITION_PATH;

  /** Monday of the shown week; kept while the page is open. */
  protected readonly weekStart = linkedSignal<IsoCalendarDate>(() => {
    const today = this.nutrition.today();
    const requested = weekStartOf(this.date() ?? today);
    const current = weekStartOf(today) as IsoCalendarDate;
    return requested && requested <= current ? requested : current;
  });

  private readonly state = resource({
    params: () => ({ start: this.weekStart() }),
    loader: ({ params }) => this.nutrition.week(params.start),
  });

  /** Keeps the shown week while reloading (no flash back to the skeleton). */
  protected readonly screen = computed<NutritionWeekScreen>(() => {
    if (this.state.hasValue()) {
      return toNutritionWeekScreen(this.state.value());
    }
    return this.state.error() ? { kind: 'error' } : { kind: 'loading' };
  });

  // UI state only.
  protected readonly macro = signal<MacroMetric>('protein');
  protected readonly macroOptions: readonly SegmentOption<MacroMetric>[] = [
    { value: 'protein', label: 'Protein' },
    { value: 'carbs', label: 'Carbs' },
    { value: 'fat', label: 'Fat' },
  ];
  protected readonly calorieChart = computed(() => {
    const s = this.state.hasValue() ? this.state.value() : null;
    return s ? toWeekChart(s.week, s.targets, 'calories', s.today) : null;
  });
  protected readonly macroChart = computed(() => {
    const s = this.state.hasValue() ? this.state.value() : null;
    return s ? toWeekChart(s.week, s.targets, this.macro(), s.today) : null;
  });

  /** One persistent live region: loading, errors and the week after moving between weeks. */
  protected readonly announcement = computed(() => {
    const s = this.screen();
    switch (s.kind) {
      case 'loading':
        return this.copy.loading;
      case 'error':
        return this.copy.error.title;
      default:
        return `${s.header.title}, ${s.header.range}. ${s.loggedLabel}.`;
    }
  });

  private entered = false;

  /** Re-entry (e.g. back from the food log): re-read the week and the current targets. */
  ionViewWillEnter(): void {
    if (this.entered) {
      this.state.reload();
    }
    this.entered = true;
  }

  protected previousWeek(): void {
    const prev = shiftWeek(this.weekStart(), -1);
    if (prev) {
      this.weekStart.set(prev);
    }
  }

  protected nextWeek(): void {
    const s = this.screen();
    const next = shiftWeek(this.weekStart(), 1);
    if (s.kind === 'ready' && s.header.canGoNext && next) {
      this.weekStart.set(next);
    }
  }

  protected thisWeek(): void {
    this.weekStart.set(weekStartOf(this.nutrition.today()) as IsoCalendarDate);
  }

  protected retry(): void {
    this.state.reload();
  }

  /** Opens the day in the Nutrition food log (the dashboard shows the selected day). */
  protected async openDay(date: IsoCalendarDate): Promise<void> {
    await this.nutrition.load(date);
    void this.nav.navigateBack(NUTRITION_PATH);
  }

  /** The day view, showing the day selected there (kept while the week is browsed). */
  protected openDayView(): void {
    void this.nav.navigateBack(NUTRITION_PATH);
  }

  protected logFood(): void {
    void this.nav.navigateForward(NEW_FOOD_PATH, { queryParams: { meal: suggestedMeal(this.clock()), date: this.nutrition.today() } });
  }
}
