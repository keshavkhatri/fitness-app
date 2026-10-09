import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';

import { NutritionService } from '../../core/nutrition/nutrition.service';
import { ONBOARDING_PATH, ONBOARDING_REVIEW_PATH } from '../../core/profile/onboarding.guards';
import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import { CLOCK } from '../../core/time/clock';
import { WorkoutHistoryService } from '../../core/workout/workout-history.service';
import { WorkoutLogService } from '../../core/workout/workout-log.service';
import { WorkoutPlanService } from '../../core/workout/workout-plan.service';
import { NUTRITION_PATH } from '../nutrition/nutrition-paths';
import { toDaySummary } from '../nutrition/nutrition-view-model';
import { WORKOUT_PATH, activeWorkoutPath, historyDetailPath, workoutSessionPath } from '../workout/workout-paths';
import { toWorkoutScreen } from '../workout/workout-view-model';
import {
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  PageLayoutComponent,
  SectionHeaderComponent,
} from '../../shared/ui';
import { GoalSummaryCardComponent } from './components/goal-summary-card/goal-summary-card.component';
import { NutritionSummaryCardComponent } from './components/nutrition-summary-card/nutrition-summary-card.component';
import { ProgressSummaryCardComponent } from './components/progress-summary-card/progress-summary-card.component';
import { TodayWorkoutCardComponent } from './components/today-workout-card/today-workout-card.component';
import { greetingFor } from './greeting';
import { toHomeGoal } from './home-goal';
import { HomeProgressView, HomeWorkoutView, toHomeProgress, toHomeWorkout } from './home-training';

export const PROGRESS_PATH = '/you/progress';

/**
 * Home: today at a glance. Each card loads independently (a failure only
 * affects its own card) and is re-read whenever the Home tab is re-entered.
 * Every card shows the user's real data; nothing is demo content.
 */
@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  imports: [
    DatePipe,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    PageLayoutComponent,
    SectionHeaderComponent,
    GoalSummaryCardComponent,
    NutritionSummaryCardComponent,
    ProgressSummaryCardComponent,
    TodayWorkoutCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly profiles = inject(FitnessProfileService);
  private readonly nutritionService = inject(NutritionService);
  private readonly plans = inject(WorkoutPlanService);
  private readonly logs = inject(WorkoutLogService);
  private readonly workoutHistory = inject(WorkoutHistoryService);
  private readonly clock = inject(CLOCK);
  private readonly router = inject(Router);
  private readonly nav = inject(NavController);

  protected readonly today = this.clock();
  protected readonly greeting = greetingFor(this.today);
  /** The goal card: the saved profile's goal and target (no progress is tracked yet). */
  protected readonly goal = resource({ loader: async () => toHomeGoal(await this.profiles.load()) });

  /** Today's session by the plan's weekday layout (the Workout tab's own view model). */
  protected readonly plan = resource({
    loader: async () => {
      // Knowing the in-progress workout decides "Resume Workout" (read from the log service, never inferred).
      await this.logs.loadActive();
      return toWorkoutScreen(await this.plans.load(), this.clock());
    },
  });
  /** null while loading or after a failed load (see `plan.error()`). */
  protected readonly workout = computed<HomeWorkoutView | null>(() =>
    this.plan.hasValue() ? toHomeWorkout(this.plan.value(), this.logs.active()) : null,
  );

  /** One history read: this week's count and the latest workout. */
  protected readonly history = resource({ loader: () => this.workoutHistory.overview() });
  protected readonly progress = computed<HomeProgressView | null>(() => {
    if (this.history.hasValue()) {
      return toHomeProgress(this.history.value(), this.clock());
    }
    return this.history.error() ? { kind: 'error' } : null;
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

  private entered = false;

  /** Ionic tab re-entry (e.g. back from a workout or from logging food): re-read every real card. */
  ionViewWillEnter(): void {
    if (this.entered) {
      this.goal.reload();
      this.plan.reload();
      this.history.reload();
      this.nutrition.reload();
    }
    this.entered = true;
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
}
