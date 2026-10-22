import { ChangeDetectionStrategy, Component, DestroyRef, Injector, computed, effect, inject, resource, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { NavController } from '@ionic/angular';

import { DailyCheckInService } from '../../core/daily-check-in/daily-check-in.service';
import { WeightHistoryService } from '../../core/body-measurements/weight-history.service';
import { UserIdentityService } from '../../core/identity/user-identity.service';
import { NutritionService } from '../../core/nutrition/nutrition.service';
import { ONBOARDING_PATH } from '../../core/profile/onboarding.guards';
import { ActivityStreakService } from '../../core/streak/activity-streak.service';
import { CLOCK, localIsoDate } from '../../core/time/clock';
import { WorkoutHistoryService } from '../../core/workout/workout-history.service';
import { WorkoutLogService } from '../../core/workout/workout-log.service';
import { WorkoutPlanService } from '../../core/workout/workout-plan.service';
import { RecoveryLevel } from '../../domain/daily-check-in';
import { WATER_GLASS_ML } from '../../domain/nutrition';
import { WaterLogService } from '../../core/nutrition/water-log.service';
import { MealCategory } from '../../domain/nutrition';
import { NotificationInboxService } from '../notifications/notification-inbox.service';
import { NOTIFICATIONS_PATH } from '../notifications/notifications.page';
import { NEW_FOOD_PATH, NUTRITION_PATH } from '../nutrition/nutrition-paths';
import { toDaySummary } from '../nutrition/nutrition-view-model';
import { WORKOUT_COPY } from '../workout/workout-content';
import { WORKOUT_PATH, activeWorkoutPath, workoutSessionPath } from '../workout/workout-paths';
import { toWorkoutScreen, weekdayIndexOf } from '../workout/workout-view-model';
import {
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  PageLayoutComponent,
  PageRefreshEvent,
} from '../../shared/ui';
import { CheckInSheetsComponent } from './components/check-in-sheets/check-in-sheets.component';
import { DaySummaryCardComponent } from './components/day-summary-card/day-summary-card.component';
import { HomeHeaderComponent } from './components/home-header/home-header.component';
import { NutritionSummaryCardComponent } from './components/nutrition-summary-card/nutrition-summary-card.component';
import { TodayWorkoutCardComponent } from './components/today-workout-card/today-workout-card.component';
import { WeekActivityCardComponent } from './components/week-activity-card/week-activity-card.component';
import { ReviewEntryComponent } from '../fitness-review/components/review-entry.component';
import { FITNESS_REVIEW_PATH } from '../fitness-review/fitness-review-paths';
import { BodyOverviewCardComponent } from './components/dashboard-cards/body-overview-card.component';
import { HydrationCardComponent } from '../nutrition/components/hydration-card.component';
import { WaterSheetComponent } from '../nutrition/components/water-sheet.component';
import { toHydration } from '../nutrition/nutrition-water';
import { MacroTargetCardComponent } from './components/dashboard-cards/macro-target-card.component';
import { MilestoneCardComponent } from './components/dashboard-cards/milestone-card.component';
import { MindsetCardComponent } from './components/dashboard-cards/mindset-card.component';
import { TodayFocusCardComponent } from './components/dashboard-cards/today-focus-card.component';
import { TodayMealsCardComponent } from './components/dashboard-cards/today-meals-card.component';
import { TrackProgressCardComponent } from './components/dashboard-cards/track-progress-card.component';
import { WeeklyProgressCardComponent } from './components/dashboard-cards/weekly-progress-card.component';
import { greetingFor } from './greeting';
import { toBodyOverview, toFocus, toMacroRings, toMealTiles, toMilestone, toWeeklyProgress } from './home-dashboard';
import { mindsetFor } from './home-dashboard-content';
import { HomeDayView, HomeTileAction, toHomeDay } from './home-today';
import { HomeWeekView, HomeWorkoutView, toHomeWeek, toHomeWorkout } from './home-training';

export const PROGRESS_PATH = '/progress';
export const YOU_PATH = '/you';

/**
 * Home: today at a glance, in the dashboard screen theme. Each part loads
 * independently (a failure only affects its own card) and is re-read
 * whenever the Home tab is re-entered or the page is pulled to refresh.
 * Every card shows the user's real data; nothing is demo content.
 */
@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  imports: [
    BodyOverviewCardComponent,
    HydrationCardComponent,
    WaterSheetComponent,
    MacroTargetCardComponent,
    MilestoneCardComponent,
    MindsetCardComponent,
    TodayFocusCardComponent,
    TodayMealsCardComponent,
    TrackProgressCardComponent,
    WeeklyProgressCardComponent,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    PageLayoutComponent,
    ReviewEntryComponent,
    CheckInSheetsComponent,
    DaySummaryCardComponent,
    HomeHeaderComponent,
    NutritionSummaryCardComponent,
    TodayWorkoutCardComponent,
    WeekActivityCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'fit-theme-dashboard' },
})
export class HomePage {
  private readonly nutritionService = inject(NutritionService);
  private readonly plans = inject(WorkoutPlanService);
  private readonly logs = inject(WorkoutLogService);
  private readonly workoutHistory = inject(WorkoutHistoryService);
  private readonly weightHistory = inject(WeightHistoryService);
  private readonly checkInService = inject(DailyCheckInService);
  private readonly identityService = inject(UserIdentityService);
  private readonly streakService = inject(ActivityStreakService);
  private readonly waterLog = inject(WaterLogService);
  protected readonly inbox = inject(NotificationInboxService);
  private readonly clock = inject(CLOCK);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly nav = inject(NavController);
  private readonly injector = inject(Injector);

  // --- Header -------------------------------------------------------------------------------
  /** Name and photo for the greeting and avatar. */
  protected readonly identity = resource({ loader: () => this.identityService.load() });
  /** Consecutive active days; null while loading or when it can't be read. */
  protected readonly streak = resource({ loader: () => this.streakService.current() });

  /** New users (no profile) are welcomed rather than greeted by time of day. */
  protected readonly greeting = computed(() =>
    this.plan.hasValue() && this.plan.value().screen.kind === 'no-profile' ? 'Welcome' : greetingFor(this.clock()),
  );

  // --- Training -----------------------------------------------------------------------------
  /**
   * Today's session by the plan's weekday layout (the Workout tab's own view
   * model), plus the plan's sessions for their body areas and set counts.
   */
  protected readonly plan = resource({
    loader: async () => {
      // Knowing the in-progress workout decides "Resume" (read from the log service, never inferred).
      await this.logs.loadActive();
      const state = await this.plans.load();
      return { screen: toWorkoutScreen(state, this.clock()), sessions: state.kind === 'ready' ? state.plan.sessions : [] };
    },
  });
  /** null while loading or after a failed load (see `plan.error()`). */
  protected readonly workout = computed<HomeWorkoutView | null>(() => {
    if (!this.plan.hasValue()) {
      return null;
    }
    const { screen, sessions } = this.plan.value();
    return toHomeWorkout(screen, this.logs.active(), sessions);
  });

  /** One history read: this week's finished workouts per day and the overview. */
  protected readonly history = resource({ loader: () => this.workoutHistory.weekOverview() });
  /** `weekOverview()` resolves null when history can't be read: an error like a rejection. */
  protected readonly historyFailed = computed(() => !!this.history.error() || (this.history.hasValue() && this.history.value() === null));
  /** The plan's week with finished workouts; null until both are read (or without a plan). */
  protected readonly week = computed<HomeWeekView | null>(() => {
    const history = this.history.hasValue() ? this.history.value() : null;
    return this.plan.hasValue() && history ? toHomeWeek(this.plan.value().screen, history.week, history.overview) : null;
  });

  // --- Dashboard cards (the mockup's second half) ------------------------------------------
  /** Weigh-ins (body overview). */
  protected readonly bodyData = resource({ loader: () => this.weightHistory.load().catch(() => undefined) });
  /** Water today (Nutrition's water log) and the daily goal. */
  protected readonly water = resource({
    loader: async () => {
      const [, goal] = await Promise.all([this.waterLog.load(), this.waterLog.goalMl()]);
      return { goal };
    },
  });
  /** This week's food log (average calories); null when it can't be read. */
  protected readonly nutritionWeek = resource({ loader: () => this.nutritionService.week().catch(() => null) });

  protected readonly milestone = computed(() => toMilestone(this.streak.hasValue() ? this.streak.value() : null));
  protected readonly body = computed(() => (this.bodyData.isLoading() ? null : toBodyOverview(this.weightHistory.state(), this.todayIso())));
  protected readonly mindset = computed(() => {
    const [y, m, d] = this.todayIso().split('-').map(Number);
    return mindsetFor(Date.UTC(y, m - 1, d) / 86_400_000);
  });

  protected readonly waterGoal = computed(() => (this.water.hasValue() ? this.water.value().goal : 3_000));
  protected readonly todayWater = computed(() => this.waterLog.days()[this.todayIso()] ?? 0);
  protected readonly hydration = computed(() => toHydration(this.todayWater(), this.waterGoal()));
  protected readonly waterOpen = signal(false);

  protected readonly weekly = computed(() => {
    const week = this.nutritionWeek.hasValue() ? this.nutritionWeek.value() : null;
    return toWeeklyProgress({
      week: this.week(),
      steps: this.checkInService.checkIns().steps,
      nutrition: week?.week ?? null,
      targets: week?.targets ?? null,
      today: this.todayIso(),
    });
  });

  // --- Your day -----------------------------------------------------------------------------
  /** Today's steps and recovery check-in. */
  protected readonly checkIns = resource({ loader: () => this.checkInService.load() });
  private readonly todayIso = computed(() => localIsoDate(this.clock()));
  protected readonly todaySteps = computed(() => this.checkInService.checkIns().steps[this.todayIso()] ?? null);
  protected readonly todayRecovery = computed(() => this.checkInService.checkIns().recovery[this.todayIso()] ?? null);
  protected readonly activityDone = computed(() => !!this.checkInService.checkIns().activity[this.todayIso()]);

  /** null until today's plan and history are known (a plan failure reads as unavailable). */
  protected readonly day = computed<HomeDayView | null>(() => {
    const workout = this.workout() ?? (this.plan.error() ? ({ kind: 'unavailable' } as const) : null);
    if (!workout || this.checkIns.isLoading() || (!this.history.hasValue() && !this.historyFailed())) {
      return null;
    }
    const history = this.history.hasValue() ? this.history.value() : null;
    const finishedToday = (history?.week[weekdayIndexOf(this.clock())]?.workouts ?? 0) > 0;
    return toHomeDay({ workout, finishedToday, steps: this.todaySteps(), recovery: this.todayRecovery() });
  });

  protected readonly stepsOpen = signal(false);
  protected readonly recoveryOpen = signal(false);
  protected readonly savingCheckIn = signal(false);
  protected readonly checkInError = signal<string | null>(null);
  protected readonly savingWater = signal(false);
  protected readonly waterError = signal<string | null>(null);

  // --- Nutrition ----------------------------------------------------------------------------
  /**
   * Today's real intake and targets (Nutrition's own presentation model, so
   * no totals or target arithmetic happen here).
   */
  protected readonly nutrition = resource({
    loader: async () => {
      const { day, targets } = await this.nutritionService.snapshot();
      return { ...toDaySummary(day, targets), meals: toMealTiles(day) };
    },
  });

  protected readonly macroRings = computed(() => (this.nutrition.hasValue() ? toMacroRings(this.nutrition.value()) : null));
  protected readonly focus = computed(() => toFocus(this.nutrition.hasValue() ? this.nutrition.value() : null));

  protected readonly starting = signal(false);
  protected readonly startMessage = signal('');

  private entered = false;
  /** The first load's entrance (cards rising in one after another); not replayed on every return to the tab. */
  protected readonly intro = signal(true);

  constructor() {
    const introTimer = setTimeout(() => this.intro.set(false), 1600);
    inject(DestroyRef).onDestroy(() => clearTimeout(introTimer));
    this.hapticOnCalorieTarget();
    void this.inbox.refresh().catch(() => undefined);
    this.openCheckInFromQuery();
  }

  /** Ionic tab re-entry (e.g. back from a workout or from logging food): re-read every real card. */
  ionViewWillEnter(): void {
    if (this.entered) {
      this.reloadAll();
    }
    this.entered = true;
  }

  /** Pull to refresh: the same reloads, finished once every card has settled. */
  protected async refresh(event: PageRefreshEvent): Promise<void> {
    this.reloadAll();
    await this.whenSettled();
    event.complete();
  }

  private reloadAll(): void {
    this.identity.reload();
    this.streak.reload();
    this.plan.reload();
    this.history.reload();
    this.checkIns.reload();
    this.nutrition.reload();
    this.bodyData.reload();
    this.water.reload();
    this.nutritionWeek.reload();
    void this.inbox.refresh().catch(() => undefined);
  }

  private whenSettled(): Promise<void> {
    const loading = computed(() =>
      [this.identity, this.streak, this.plan, this.history, this.checkIns, this.nutrition, this.bodyData, this.water, this.nutritionWeek].some((r) =>
        r.isLoading(),
      ),
    );
    return new Promise((resolve) => {
      const watcher = effect(
        () => {
          if (!loading()) {
            watcher.destroy();
            resolve();
          }
        },
        { injector: this.injector, manualCleanup: true },
      );
    });
  }

  /** The notification inbox's recovery reminder links here with `?checkIn=recovery`. */
  private openCheckInFromQuery(): void {
    const subscription = this.route.queryParamMap.subscribe((params) => {
      if (params.get('checkIn') === 'recovery') {
        this.recoveryOpen.set(true);
        void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
      }
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  /**
   * One light tap the first time today's intake crosses the calorie target
   * (seen as `over` turning true on a reload). An extra signal only: the bar
   * and "Over target" text always show it. Skipped under reduced motion; the
   * OS haptics setting is honoured by the platform.
   */
  private hapticOnCalorieTarget(): void {
    let wasOver: boolean | null = null;
    let firedOn: string | null = null;
    effect(() => {
      if (!this.nutrition.hasValue()) {
        return;
      }
      const over = this.nutrition.value().calories.over;
      const day = localIsoDate(this.clock());
      if (over && wasOver === false && firedOn !== day && !prefersReducedMotion()) {
        firedOn = day;
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
      }
      wasOver = over;
    });
  }

  // --- Check-ins ----------------------------------------------------------------------------
  protected async saveSteps(steps: number): Promise<void> {
    await this.saveCheckIn(() => this.checkInService.setSteps(this.todayIso(), steps), () => this.stepsOpen.set(false));
  }

  protected async saveRecovery(level: RecoveryLevel): Promise<void> {
    await this.saveCheckIn(() => this.checkInService.setRecovery(this.todayIso(), level), () => this.recoveryOpen.set(false));
  }

  private async saveCheckIn(save: () => Promise<void>, close: () => void): Promise<void> {
    if (this.savingCheckIn()) {
      return;
    }
    this.savingCheckIn.set(true);
    this.checkInError.set(null);
    try {
      await save();
      close();
      // A check-in can start or extend the streak and settles a reminder.
      this.streak.reload();
      void this.inbox.refresh().catch(() => undefined);
    } catch {
      this.checkInError.set("Couldn't save. Try again.");
    } finally {
      this.savingCheckIn.set(false);
    }
  }

  // --- Navigation ---------------------------------------------------------------------------
  /** Start today's workout directly; a conflict or failure falls back to Workout Detail's handling. */
  protected async startSession(sessionId: string): Promise<void> {
    if (this.starting()) {
      return;
    }
    this.starting.set(true);
    this.startMessage.set('');
    try {
      const result = await this.logs.start(sessionId);
      switch (result.kind) {
        case 'started':
        case 'resumed':
          void this.nav.navigateForward(activeWorkoutPath(sessionId));
          return;
        case 'conflict':
          // Workout Detail explains the one-workout-at-a-time choice.
          void this.nav.navigateForward(workoutSessionPath(sessionId));
          return;
        default:
          this.startMessage.set(WORKOUT_COPY.detail.startFailed);
      }
    } catch {
      this.startMessage.set(WORKOUT_COPY.detail.startFailed);
    } finally {
      this.starting.set(false);
    }
  }

  /** A tile of "Your day" was tapped. */
  protected runTileAction(action: HomeTileAction): void {
    switch (action.kind) {
      case 'log-steps':
        this.checkInError.set(null);
        this.stepsOpen.set(true);
        break;
      case 'check-in-recovery':
        this.checkInError.set(null);
        this.recoveryOpen.set(true);
        break;
      case 'resume':
        this.resumeSession(action.sessionId);
        break;
      case 'open-session':
        this.openSession(action.sessionId);
        break;
      case 'workout-tab':
        this.openWorkoutTab();
        break;
      case 'set-up-profile':
        this.setUpProfile();
        break;
    }
  }

  /** Today's light activity: the user's own "done" (the app doesn't track it), or undone. Counts for the streak. */
  protected async markActivity(sessionId: string | null): Promise<void> {
    try {
      await this.checkInService.setActivityDone(this.todayIso(), sessionId);
      this.streak.reload();
    } catch {
      // Not saved: the card keeps its previous state.
    }
  }

  /** "+" on the hydration card: one glass more. */
  protected addGlass(): void {
    void this.saveWater(() => this.waterLog.add(this.todayIso(), WATER_GLASS_ML));
  }

  protected openWater(): void {
    this.waterError.set(null);
    this.waterOpen.set(true);
  }

  /** Today's water total, from the sheet (it stays open to keep adjusting). */
  protected setWater(ml: number): void {
    void this.saveWater(() => this.waterLog.set(this.todayIso(), ml));
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

  /** A "Today's focus" item: steps opens the steps sheet, protein opens Nutrition. */
  protected runFocus(key: 'steps' | 'protein'): void {
    if (key === 'steps') {
      this.runTileAction({ kind: 'log-steps' });
    } else {
      this.openNutrition();
    }
  }

  /** "+" on a meal: Add food for that meal, today. */
  protected addFood(meal: MealCategory): void {
    void this.nav.navigateForward(NEW_FOOD_PATH, { queryParams: { meal } });
  }

  protected openWeightHistory(): void {
    void this.nav.navigateForward('/you/weight-history');
  }

  protected logWeight(): void {
    void this.nav.navigateForward(['/you', 'weight-history', 'new']);
  }

  protected openStreak(): void {
    void this.nav.navigateForward('/home/streak');
  }

  protected openNotifications(): void {
    void this.nav.navigateForward(NOTIFICATIONS_PATH);
  }

  protected openYou(): void {
    void this.router.navigateByUrl(YOU_PATH);
  }

  protected openSession(sessionId: string): void {
    void this.nav.navigateForward(workoutSessionPath(sessionId));
  }

  protected resumeSession(sessionId: string): void {
    void this.nav.navigateForward(activeWorkoutPath(sessionId));
  }

  protected openWorkoutTab(): void {
    void this.router.navigateByUrl(WORKOUT_PATH);
  }

  protected openReview(): void {
    void this.nav.navigateForward(FITNESS_REVIEW_PATH);
  }

  /** "This week" is about workouts: Progress opens on its Workout section. */
  protected openProgress(): void {
    void this.router.navigateByUrl(`${PROGRESS_PATH}?view=workout`);
  }

  protected openProgressOverview(): void {
    void this.router.navigateByUrl(PROGRESS_PATH);
  }

  protected setUpProfile(): void {
    void this.router.navigateByUrl(ONBOARDING_PATH);
  }

  protected openNutrition(): void {
    void this.router.navigateByUrl(NUTRITION_PATH);
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
