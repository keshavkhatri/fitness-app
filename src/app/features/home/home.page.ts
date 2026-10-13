import { ChangeDetectionStrategy, Component, DestroyRef, Injector, computed, effect, inject, resource, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { NavController } from '@ionic/angular';

import { DailyCheckInService } from '../../core/daily-check-in/daily-check-in.service';
import { UserIdentityService } from '../../core/identity/user-identity.service';
import { NutritionService } from '../../core/nutrition/nutrition.service';
import { ONBOARDING_PATH } from '../../core/profile/onboarding.guards';
import { ActivityStreakService } from '../../core/streak/activity-streak.service';
import { CLOCK, localIsoDate } from '../../core/time/clock';
import { WorkoutHistoryService } from '../../core/workout/workout-history.service';
import { WorkoutLogService } from '../../core/workout/workout-log.service';
import { WorkoutPlanService } from '../../core/workout/workout-plan.service';
import { RecoveryLevel } from '../../domain/daily-check-in';
import { NotificationInboxService } from '../notifications/notification-inbox.service';
import { NOTIFICATIONS_PATH } from '../notifications/notifications.page';
import { NUTRITION_PATH } from '../nutrition/nutrition-paths';
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
import { greetingFor } from './greeting';
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
  private readonly checkInService = inject(DailyCheckInService);
  private readonly identityService = inject(UserIdentityService);
  private readonly streakService = inject(ActivityStreakService);
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

  // --- Your day -----------------------------------------------------------------------------
  /** Today's steps and recovery check-in. */
  protected readonly checkIns = resource({ loader: () => this.checkInService.load() });
  private readonly todayIso = computed(() => localIsoDate(this.clock()));
  protected readonly todaySteps = computed(() => this.checkInService.checkIns().steps[this.todayIso()] ?? null);
  protected readonly todayRecovery = computed(() => this.checkInService.checkIns().recovery[this.todayIso()] ?? null);

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

  // --- Nutrition ----------------------------------------------------------------------------
  /**
   * Today's real intake and targets (Nutrition's own presentation model, so
   * no totals or target arithmetic happen here).
   */
  protected readonly nutrition = resource({
    loader: async () => {
      const { day, targets } = await this.nutritionService.snapshot();
      return toDaySummary(day, targets);
    },
  });

  protected readonly starting = signal(false);
  protected readonly startMessage = signal('');

  private entered = false;

  constructor() {
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
    void this.inbox.refresh().catch(() => undefined);
  }

  private whenSettled(): Promise<void> {
    const loading = computed(() =>
      [this.identity, this.streak, this.plan, this.history, this.checkIns, this.nutrition].some((r) => r.isLoading()),
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

  protected openProgress(): void {
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
