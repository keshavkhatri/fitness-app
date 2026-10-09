import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon, NavController } from '@ionic/angular';

import { ONBOARDING_PATH, ONBOARDING_REVIEW_PATH } from '../../core/profile/onboarding.guards';
import { CLOCK } from '../../core/time/clock';
import { WorkoutHistoryService } from '../../core/workout/workout-history.service';
import { WorkoutLogService } from '../../core/workout/workout-log.service';
import { WorkoutPlanService } from '../../core/workout/workout-plan.service';
import {
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  NoticeComponent,
  PageLayoutComponent,
  SectionHeaderComponent,
} from '../../shared/ui';
import { ExerciseListComponent } from './components/exercise-list.component';
import { PlanSummaryComponent } from './components/plan-summary.component';
import { TodayHeroComponent } from './components/today-hero.component';
import { WeekScheduleComponent } from './components/week-schedule.component';
import { toResumeCard } from './active/active-workout-view-model';
import { toRecentWorkouts } from './history/history-view-model';
import { WORKOUT_COPY } from './workout-content';
import { DayView, WorkoutScreen, toWorkoutScreen } from './workout-view-model';
import { workoutSessionPath } from './workout-paths';

/** Workout Detail route for a plan session id. */
export { workoutSessionPath } from './workout-paths';

/**
 * The user's training plan: today first, then the week, today's exercises
 * and the plan's key facts. Training days open Workout Detail. The plan
 * lifecycle lives in WorkoutPlanService; this page only renders the view model.
 */
@Component({
  selector: 'app-workout',
  templateUrl: './workout.page.html',
  styleUrl: './workout.page.scss',
  imports: [
    IonIcon,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    NoticeComponent,
    PageLayoutComponent,
    SectionHeaderComponent,
    ExerciseListComponent,
    PlanSummaryComponent,
    TodayHeroComponent,
    WeekScheduleComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkoutPage {
  private readonly plans = inject(WorkoutPlanService);
  private readonly clock = inject(CLOCK);
  private readonly nav = inject(NavController);
  private readonly router = inject(Router);
  private readonly logs = inject(WorkoutLogService);
  private readonly history = inject(WorkoutHistoryService);

  protected readonly copy = WORKOUT_COPY;
  private readonly state = resource({
    loader: async () => {
      // An interrupted workout is offered for resuming (it never changes with the plan).
      await this.logs.loadActive();
      return toWorkoutScreen(await this.plans.load(), this.clock());
    },
  });

  /** Latest finished workouts (secondary to the plan; hidden if history can't be read). */
  private readonly recentState = resource({ loader: () => this.history.list() });
  protected readonly recent = computed(() => {
    const result = this.recentState.hasValue() ? this.recentState.value() : null;
    return result?.ok ? toRecentWorkouts(result.workouts, this.clock()) : null;
  });

  protected readonly resume = computed(() => {
    const log = this.logs.active();
    return log ? toResumeCard(log) : null;
  });

  /** null while the first load is in progress. A failed load is presented as "unavailable". */
  protected readonly screen = computed<WorkoutScreen | null>(() => {
    if (this.state.hasValue()) {
      return this.state.value();
    }
    return this.state.error() ? { kind: 'unavailable' } : null;
  });
  protected readonly retrying = computed(() => this.state.isLoading());

  private entered = false;

  /** Ionic tab re-entry: re-check the plan (the profile may have changed elsewhere). */
  ionViewWillEnter(): void {
    if (this.entered) {
      this.state.reload();
      this.recentState.reload();
    }
    this.entered = true;
  }

  protected openDay(day: DayView): void {
    if (day.sessionId) {
      void this.nav.navigateForward(workoutSessionPath(day.sessionId));
    }
  }

  protected resumeWorkout(sessionId: string): void {
    void this.nav.navigateForward(['/workout', 'session', sessionId, 'active']);
  }

  protected openHistory(): void {
    void this.nav.navigateForward(['/workout', 'history']);
  }

  protected openWorkoutLog(id: string): void {
    void this.nav.navigateForward(['/workout', 'history', id]);
  }

  protected retry(): void {
    this.state.reload();
  }

  protected async setUpProfile(): Promise<void> {
    await this.router.navigateByUrl(ONBOARDING_PATH);
  }

  protected async reviewProfile(): Promise<void> {
    await this.router.navigateByUrl(ONBOARDING_REVIEW_PATH);
  }
}
