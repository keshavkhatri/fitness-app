import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, effect, inject, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { IonIcon, NavController } from '@ionic/angular';

import { WeightHistoryService } from '../../core/body-measurements/weight-history.service';
import { NutritionService } from '../../core/nutrition/nutrition.service';
import { ONBOARDING_PATH, ONBOARDING_REVIEW_PATH } from '../../core/profile/onboarding.guards';
import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import { CLOCK, localIsoDate } from '../../core/time/clock';
import { WorkoutHistoryService } from '../../core/workout/workout-history.service';
import { WorkoutLogService } from '../../core/workout/workout-log.service';
import { WorkoutPlanService } from '../../core/workout/workout-plan.service';
import { NEW_WEIGHT_PATH, WEIGHT_HISTORY_PATH } from '../body-weight/weight-history-paths';
import { NEW_FOOD_PATH, NUTRITION_PATH } from '../nutrition/nutrition-paths';
import { toDaySummary } from '../nutrition/nutrition-view-model';
import { WORKOUT_COPY } from '../workout/workout-content';
import { WORKOUT_PATH, activeWorkoutPath, historyDetailPath, workoutSessionPath } from '../workout/workout-paths';
import { toWorkoutScreen } from '../workout/workout-view-model';
import {
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  PageLayoutComponent,
  PageRefreshEvent,
  SectionHeaderComponent,
} from '../../shared/ui';
import { GoalSummaryCardComponent } from './components/goal-summary-card/goal-summary-card.component';
import { NutritionSummaryCardComponent } from './components/nutrition-summary-card/nutrition-summary-card.component';
import { ProgressSummaryCardComponent } from './components/progress-summary-card/progress-summary-card.component';
import { StatTileComponent } from './components/stat-tile/stat-tile.component';
import { TodayWorkoutCardComponent } from './components/today-workout-card/today-workout-card.component';
import { WeekStripComponent } from './components/week-strip/week-strip.component';
import { WeightTileComponent } from './components/weight-tile/weight-tile.component';
import { greetingFor } from './greeting';
import { toHomeGoal } from './home-goal';
import { HomeProgressView, HomeWeekView, HomeWorkoutView, toHomeProgress, toHomeWeek, toHomeWorkout } from './home-training';
import { HomeWeightView, toHomeWeight } from './home-weight';

export const PROGRESS_PATH = '/you/progress';

/**
 * Home: today at a glance. Each card loads independently (a failure only
 * affects its own card) and is re-read whenever the Home tab is re-entered
 * or the page is pulled to refresh. Every card shows the user's real data;
 * nothing is demo content.
 */
@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  imports: [
    DatePipe,
    IonIcon,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    PageLayoutComponent,
    SectionHeaderComponent,
    GoalSummaryCardComponent,
    NutritionSummaryCardComponent,
    ProgressSummaryCardComponent,
    StatTileComponent,
    TodayWorkoutCardComponent,
    WeekStripComponent,
    WeightTileComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly profiles = inject(FitnessProfileService);
  private readonly nutritionService = inject(NutritionService);
  private readonly plans = inject(WorkoutPlanService);
  private readonly logs = inject(WorkoutLogService);
  private readonly workoutHistory = inject(WorkoutHistoryService);
  private readonly weights = inject(WeightHistoryService);
  private readonly clock = inject(CLOCK);
  private readonly router = inject(Router);
  private readonly nav = inject(NavController);
  private readonly injector = inject(Injector);

  protected readonly today = this.clock();
  /** The goal card: the saved profile's goal and target (no progress is tracked yet). */
  protected readonly goal = resource({ loader: async () => toHomeGoal(await this.profiles.load()) });
  /** New users are welcomed rather than greeted by time of day. */
  protected readonly greeting = computed(() =>
    this.goal.hasValue() && this.goal.value().kind === 'no-profile' ? 'Welcome' : greetingFor(this.today),
  );

  /** Today's session by the plan's weekday layout (the Workout tab's own view model). */
  protected readonly plan = resource({
    loader: async () => {
      // Knowing the in-progress workout decides "Resume" (read from the log service, never inferred).
      await this.logs.loadActive();
      return toWorkoutScreen(await this.plans.load(), this.clock());
    },
  });
  /** null while loading or after a failed load (see `plan.error()`). */
  protected readonly workout = computed<HomeWorkoutView | null>(() =>
    this.plan.hasValue() ? toHomeWorkout(this.plan.value(), this.logs.active()) : null,
  );

  /** One history read: this week's finished workouts and the latest workout. */
  protected readonly history = resource({ loader: () => this.workoutHistory.weekOverview() });
  protected readonly progress = computed<HomeProgressView | null>(() => {
    if (this.history.hasValue()) {
      const value = this.history.value();
      return toHomeProgress(value?.overview ?? null, this.clock());
    }
    return this.history.error() ? { kind: 'error' } : null;
  });
  /** The plan's week with finished workouts; null until both are read (or without a plan). */
  protected readonly week = computed<HomeWeekView | null>(() => {
    const history = this.history.hasValue() ? this.history.value() : null;
    return this.plan.hasValue() && history ? toHomeWeek(this.plan.value(), history.week, history.overview) : null;
  });

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

  /** Latest recorded weight and the last 30 days (never the profile's weight). */
  protected readonly weight = resource({
    loader: async () => {
      await this.weights.load();
      return toHomeWeight(this.weights.state(), this.weights.today());
    },
  });

  protected readonly weightError: HomeWeightView = { kind: 'error' };

  protected readonly starting = signal(false);
  protected readonly startMessage = signal('');

  private entered = false;

  constructor() {
    this.hapticOnCalorieTarget();
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
    this.goal.reload();
    this.plan.reload();
    this.history.reload();
    this.nutrition.reload();
    this.weight.reload();
  }

  private whenSettled(): Promise<void> {
    const loading = computed(() =>
      [this.goal, this.plan, this.history, this.nutrition, this.weight].some((r) => r.isLoading()),
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

  /**
   * One light tap the first time today's intake crosses the calorie target
   * (seen as `over` turning true on a reload). An extra signal only: the ring
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

  protected openSession(sessionId: string): void {
    void this.nav.navigateForward(workoutSessionPath(sessionId));
  }

  protected resumeSession(sessionId: string): void {
    void this.nav.navigateForward(activeWorkoutPath(sessionId));
  }

  protected openWorkoutTab(): void {
    void this.router.navigateByUrl(WORKOUT_PATH);
  }

  protected openFinishedWorkout(workoutId: string): void {
    void this.nav.navigateForward(historyDetailPath(workoutId));
  }

  protected openProgress(): void {
    void this.nav.navigateForward(PROGRESS_PATH);
  }

  protected reviewProfile(): void {
    void this.router.navigateByUrl(ONBOARDING_REVIEW_PATH);
  }

  protected setUpProfile(): void {
    void this.router.navigateByUrl(ONBOARDING_PATH);
  }

  protected openNutrition(): void {
    void this.router.navigateByUrl(NUTRITION_PATH);
  }

  /** Today (local), as Quick Add's "Add food" does. */
  protected logFood(): void {
    void this.nav.navigateForward(NEW_FOOD_PATH, { queryParams: { date: localIsoDate(this.clock()) } });
  }

  protected openWeightHistory(): void {
    void this.nav.navigateForward(WEIGHT_HISTORY_PATH);
  }

  protected logWeight(): void {
    void this.nav.navigateForward(NEW_WEIGHT_PATH);
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
