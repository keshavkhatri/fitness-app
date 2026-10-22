import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon, NavController } from '@ionic/angular';

import { NutritionService } from '../../core/nutrition/nutrition.service';
import { WaterLogService } from '../../core/nutrition/water-log.service';
import { ONBOARDING_PATH, ONBOARDING_REVIEW_PATH } from '../../core/profile/onboarding.guards';
import { CLOCK } from '../../core/time/clock';
import { IsoCalendarDate } from '../../domain/fitness-profile';
import { MealCategory, WATER_GLASS_ML } from '../../domain/nutrition';
import {
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  NoticeComponent,
  PageLayoutComponent,
} from '../../shared/ui';
import { DayStripComponent } from './components/day-strip.component';
import { DaySummaryComponent } from './components/day-summary.component';
import { HydrationCardComponent } from './components/hydration-card.component';
import { WaterSheetComponent } from './components/water-sheet.component';
import { toHydration } from './nutrition-water';
import { LinkCardComponent } from './components/link-card.component';
import { MealSectionComponent } from './components/meal-section.component';
import { CHECK_IN_COPY } from '../calorie-check-in/calorie-check-in-content';
import { NUTRITION_COPY } from './nutrition-content';
import { CALORIE_CHECK_IN_PATH, NEW_FOOD_PATH, NUTRITION_WEEK_PATH, foodPath } from './nutrition-paths';
import { NoticeAction, suggestedMeal, toDateHeader, toDayStrip, toNutritionScreen } from './nutrition-view-model';

/**
 * Daily nutrition: what was eaten on the selected local day (from the food
 * log) against the day's calculated targets (from the calculation engine).
 * Opens on Today; targets are recalculated whenever the tab is re-entered.
 * The day strip, the day arrows and Back to today all change the one
 * selected date in NutritionService, which Add, Edit and Week also read.
 */
@Component({
  selector: 'app-nutrition',
  templateUrl: './nutrition.page.html',
  styleUrl: './nutrition.page.scss',
  host: { class: 'fit-theme-dashboard' },
  imports: [
    DayStripComponent,
    DaySummaryComponent,
    HydrationCardComponent,
    WaterSheetComponent,
    LinkCardComponent,
    IonIcon,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    NoticeComponent,
    PageLayoutComponent,
    MealSectionComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NutritionPage {
  private readonly nutrition = inject(NutritionService);
  private readonly nav = inject(NavController);
  private readonly router = inject(Router);
  private readonly clock = inject(CLOCK);
  private readonly waterLog = inject(WaterLogService);

  protected readonly copy = NUTRITION_COPY;
  protected readonly checkIn = CHECK_IN_COPY;
  protected readonly screen = computed(() => toNutritionScreen(this.nutrition.state()));
  protected readonly header = computed(() => toDateHeader(this.nutrition.selectedDate(), this.nutrition.today()));
  protected readonly strip = computed(() => toDayStrip(this.nutrition.selectedDate(), this.nutrition.today()));

  /** One persistent live region: loading/errors, and the day after moving between days. */
  protected readonly announcement = computed(() => {
    switch (this.screen().kind) {
      case 'loading':
        return this.copy.loading;
      case 'error':
        return this.copy.error.title;
      default:
        return this.header().label;
    }
  });

  // --- Water (the selected day) -----------------------------------------------------------------
  /** The water log and the daily goal. */
  private readonly water = resource({
    loader: async () => {
      const [, goal] = await Promise.all([this.waterLog.load(), this.waterLog.goalMl()]);
      return goal;
    },
  });
  protected readonly waterGoal = computed(() => (this.water.hasValue() ? this.water.value() : 3_000));
  protected readonly dayWater = computed(() => this.waterLog.days()[this.nutrition.selectedDate()] ?? 0);
  protected readonly hydration = computed(() =>
    toHydration(this.dayWater(), this.waterGoal(), this.header().isToday ? 'today' : `on ${this.header().date}`),
  );
  protected readonly waterOpen = signal(false);
  protected readonly savingWater = signal(false);
  protected readonly waterError = signal<string | null>(null);

  private entered = false;

  constructor() {
    void this.nutrition.load(this.nutrition.today());
  }

  /** Tab re-entry: recalculate targets (the profile may have changed); food logs are only re-read. */
  ionViewWillEnter(): void {
    if (this.entered) {
      // Water may have been added on Home.
      this.water.reload();
      void (this.nutrition.state().status === 'ready' ? this.nutrition.refreshTargets() : this.nutrition.load());
    }
    this.entered = true;
  }

  /** "+" on the hydration card: a glass more on the day shown. */
  protected addGlass(): void {
    void this.saveWater(() => this.waterLog.add(this.nutrition.selectedDate(), WATER_GLASS_ML));
  }

  protected openWater(): void {
    this.waterError.set(null);
    this.waterOpen.set(true);
  }

  protected setWater(ml: number): void {
    void this.saveWater(() => this.waterLog.set(this.nutrition.selectedDate(), ml));
  }

  private async saveWater(save: () => Promise<void>): Promise<void> {
    this.savingWater.set(true);
    this.waterError.set(null);
    try {
      await save();
    } catch {
      this.waterError.set("Couldn't save. Try again.");
    } finally {
      this.savingWater.set(false);
    }
  }

  protected previousDay(): void {
    void this.nutrition.goToPreviousDay();
  }

  protected nextDay(): void {
    if (this.header().canGoNext) {
      void this.nutrition.goToNextDay();
    }
  }

  protected selectDay(date: IsoCalendarDate): void {
    if (date <= this.nutrition.today() && date !== this.nutrition.selectedDate()) {
      void this.nutrition.load(date);
    }
  }

  protected goToToday(): void {
    void this.nutrition.goToToday();
  }

  protected retry(): void {
    void this.nutrition.load();
  }

  protected addFood(meal: MealCategory = suggestedMeal(this.clock())): void {
    void this.nav.navigateForward(NEW_FOOD_PATH, { queryParams: { meal, date: this.nutrition.selectedDate() } });
  }

  /** Logged intake vs weight trend, and a proposed target to confirm. */
  protected openCheckIn(): void {
    void this.nav.navigateForward(CALORIE_CHECK_IN_PATH);
  }

  /** The weekly summary for the week of the day shown. */
  protected openWeek(): void {
    void this.nav.navigateForward(NUTRITION_WEEK_PATH, { queryParams: { date: this.nutrition.selectedDate() } });
  }

  protected editFood(entryId: string): void {
    void this.nav.navigateForward(foodPath(entryId), { queryParams: { date: this.nutrition.selectedDate() } });
  }

  protected async noticeAction(action: NoticeAction): Promise<void> {
    await this.router.navigateByUrl(action === 'set-up-profile' ? ONBOARDING_PATH : ONBOARDING_REVIEW_PATH);
  }
}
