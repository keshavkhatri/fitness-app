import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, resource, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';

import { canAccess } from '../../core/entitlements/access-policy';
import { EntitlementService } from '../../core/entitlements/entitlement.service';
import { ONBOARDING_PATH, ONBOARDING_REVIEW_PATH } from '../../core/profile/onboarding.guards';
import { CLOCK } from '../../core/time/clock';
import { WorkoutHistoryService } from '../../core/workout/workout-history.service';
import { WorkoutLogService } from '../../core/workout/workout-log.service';
import { WorkoutPlanService } from '../../core/workout/workout-plan.service';
import {
  BottomSheetComponent,
  EmptyStateComponent,
  FitnessChipComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  NoticeComponent,
  PageLayoutComponent,
} from '../../shared/ui';
import { CUSTOM_PLAN_COPY } from './custom-plan/custom-plan-content';
import { PlanSummaryComponent } from './components/plan-summary.component';
import { PlanDateStripComponent } from './plan/plan-date-strip.component';
import { PlanTodayCardComponent } from './plan/plan-today-card.component';
import { toPlanTab } from './plan/plan-view-model';
import { PlanWeekListComponent } from './plan/plan-week-list.component';
import { WORKOUT_COPY } from './workout-content';
import { WorkoutScreen, toWorkoutScreen } from './workout-view-model';
import { CUSTOM_PLAN_EDIT_PATH, EXERCISE_LIBRARY_PATH, activeWorkoutPath, historyDetailPath, workoutSessionPath } from './workout-paths';

/** Workout Detail route for a plan session id. */
export { workoutSessionPath } from './workout-paths';

/**
 * The Workout tab's plan view: the week as a date strip, today's workout as
 * the featured card (start, resume or done), the week's sessions, then the
 * plan's key facts. History is the sibling route behind the Plan/History
 * switch. The plan lifecycle lives in WorkoutPlanService; this page only
 * renders view models.
 */
@Component({
  selector: 'app-workout',
  templateUrl: './workout.page.html',
  styleUrl: './workout.page.scss',
  host: { class: 'fit-theme-dashboard' },
  imports: [
    BottomSheetComponent,
    EmptyStateComponent,
    FitnessChipComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    NoticeComponent,
    PageLayoutComponent,
    PlanSummaryComponent,
    PlanDateStripComponent,
    PlanTodayCardComponent,
    PlanWeekListComponent,
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
  private readonly entitlements = inject(EntitlementService);

  protected readonly copy = WORKOUT_COPY;
  protected readonly customCopy = CUSTOM_PLAN_COPY;
  /** Whether the access policy lets this person build and edit a custom plan (Premium). */
  protected readonly canCustomize = computed(() => canAccess('custom-workout-plan', this.entitlements.plan()));
  protected readonly switchOpen = signal(false);
  protected readonly switching = signal(false);
  protected readonly switchMessage = signal('');
  protected readonly tab = WORKOUT_COPY.planTab;
  private readonly state = resource({
    loader: async () => {
      // An interrupted workout is offered for resuming (it never changes with the plan).
      await this.logs.loadActive();
      const plan = await this.plans.load();
      return { screen: toWorkoutScreen(plan, this.clock()), sessions: plan.kind === 'ready' ? plan.plan.sessions : [] };
    },
  });

  /** Finished workouts mark days and sessions as done (none if history can't be read). */
  private readonly finished = resource({ loader: () => this.history.list() });

  /** null while the first load is in progress. A failed load is presented as "unavailable". */
  protected readonly screen = computed<WorkoutScreen | null>(() => {
    if (this.state.hasValue()) {
      return this.state.value().screen;
    }
    return this.state.error() ? { kind: 'unavailable' } : null;
  });
  protected readonly retrying = computed(() => this.state.isLoading());

  protected readonly view = computed(() => {
    const screen = this.screen();
    if (screen?.kind !== 'ready' || !this.state.hasValue()) {
      return null;
    }
    const result = this.finished.hasValue() ? this.finished.value() : null;
    return toPlanTab(screen, this.state.value().sessions, result?.ok ? result.workouts : [], this.logs.active(), this.clock());
  });

  protected readonly starting = signal(false);
  protected readonly startMessage = signal('');
  private readonly weekHeading = viewChild<ElementRef<HTMLElement>>('weekHeading');

  private entered = false;

  constructor() {
    void this.entitlements.refresh();
  }

  /** Ionic tab re-entry: re-check the plan (the profile may have changed elsewhere) and history. */
  ionViewWillEnter(): void {
    if (this.entered) {
      this.state.reload();
      this.finished.reload();
    }
    this.entered = true;
  }

  /** Start today's workout directly; a conflict falls back to Workout Detail's explanation. */
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

  protected resumeWorkout(sessionId: string): void {
    void this.nav.navigateForward(activeWorkoutPath(sessionId));
  }

  protected openHistory(event?: Event): void {
    event?.preventDefault();
    void this.nav.navigateForward(['/workout', 'history']);
  }

  protected openWorkoutLog(id: string): void {
    void this.nav.navigateForward(historyDetailPath(id));
  }

  /** Build (Free plan) or edit (custom plan). The route's guard sends anyone without access to the offer. */
  protected editPlan(): void {
    void this.nav.navigateForward(CUSTOM_PLAN_EDIT_PATH);
  }

  protected browseExercises(): void {
    void this.nav.navigateForward(EXERCISE_LIBRARY_PATH);
  }

  /** The explicit way back from a custom plan: confirmed, then a new plan is generated from the profile. */
  protected async switchToGenerated(): Promise<void> {
    if (this.switching()) {
      return;
    }
    this.switching.set(true);
    this.switchMessage.set('');
    try {
      const result = await this.plans.useGeneratedPlan();
      if (result === 'switched') {
        this.switchOpen.set(false);
        this.state.reload();
      } else {
        this.switchMessage.set(CUSTOM_PLAN_COPY.switchBack.failed);
      }
    } finally {
      this.switching.set(false);
    }
  }

  /** Rest day: move to the week's sessions. */
  protected focusWeek(): void {
    this.weekHeading()?.nativeElement.focus();
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
