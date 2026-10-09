import { ChangeDetectionStrategy, Component, computed, inject, input, resource, signal } from '@angular/core';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular';

import { CLOCK } from '../../core/time/clock';
import { WorkoutLogService } from '../../core/workout/workout-log.service';
import { WorkoutPlanService } from '../../core/workout/workout-plan.service';
import { WorkoutLog } from '../../domain/workout-session';
import {
  BottomSheetComponent,
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  FitnessChipComponent,
  LoadingSkeletonComponent,
  SectionHeaderComponent,
} from '../../shared/ui';
import { ExerciseDetailListComponent } from './components/exercise-detail-list.component';
import { WORKOUT_COPY } from './workout-content';
import { titleFor } from './workout-formatting';
import { WorkoutDetailScreen, toWorkoutDetailScreen } from './workout-detail-view-model';
import { WORKOUT_PATH, activeWorkoutPath } from './workout-paths';

export { WORKOUT_PATH, activeWorkoutPath } from './workout-paths';

/**
 * One session of the current plan, in full, before starting it. The session
 * comes from WorkoutPlanService (the same plan the Workout tab shows) and is
 * found by its plan id from the route.
 */
@Component({
  selector: 'app-workout-detail',
  templateUrl: './workout-detail.page.html',
  styleUrl: './workout-detail.page.scss',
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonFooter,
    IonIcon,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    FitnessChipComponent,
    LoadingSkeletonComponent,
    SectionHeaderComponent,
    ExerciseDetailListComponent,
    BottomSheetComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkoutDetailPage {
  /** Route parameter (`/workout/session/:sessionId`). */
  readonly sessionId = input.required<string>();

  private readonly plans = inject(WorkoutPlanService);
  private readonly clock = inject(CLOCK);
  private readonly nav = inject(NavController);
  private readonly logs = inject(WorkoutLogService);

  protected readonly copy = WORKOUT_COPY.detail;
  protected readonly workoutPath = WORKOUT_PATH;

  private readonly state = resource({
    params: () => ({ sessionId: this.sessionId() }),
    loader: async ({ params }) => {
      // Knowing the in-progress workout (if any) decides Start vs Resume.
      await this.logs.loadActive();
      return toWorkoutDetailScreen(await this.plans.load(), params.sessionId, this.clock());
    },
  });

  /** null while loading. A failed load is presented as "unavailable". */
  protected readonly screen = computed<WorkoutDetailScreen | null>(() => {
    if (this.state.isLoading()) {
      return null;
    }
    if (this.state.hasValue()) {
      return this.state.value();
    }
    return this.state.error() ? { kind: 'unavailable' } : null;
  });

  /** One persistent live region announces state changes (loading, errors). */
  protected readonly announcement = computed(() => {
    const screen = this.screen();
    switch (screen?.kind) {
      case undefined:
        return this.copy.loading;
      case 'not-found':
        return this.copy.notFound.title;
      case 'unavailable':
        return this.copy.unavailable.title;
      default:
        return '';
    }
  });

  /** Shown above the CTA (activities can't be tracked yet; a start that failed). Announced. */
  protected readonly statusMessage = signal('');
  protected readonly starting = signal(false);

  /** "Resume Workout" when this session is the workout in progress. */
  protected readonly ctaLabel = computed(() => {
    const screen = this.screen();
    if (screen?.kind !== 'ready' || screen.detail.kind === 'rest') {
      return '';
    }
    const active = this.logs.active();
    return screen.detail.kind === 'resistance' && active?.source.sessionId === this.sessionId()
      ? this.copy.resumeWorkout
      : screen.detail.cta.label;
  });

  /** A different workout is in progress (one at a time). */
  protected readonly conflict = signal<WorkoutLog | null>(null);
  protected readonly conflictOpen = signal(false);
  protected readonly conflictTitle = computed(() => {
    const log = this.conflict();
    return log ? titleFor(log.sessionType, log.variant) : '';
  });

  protected async start(): Promise<void> {
    const screen = this.screen();
    if (screen?.kind !== 'ready' || screen.detail.kind === 'rest' || this.starting()) {
      return;
    }
    if (screen.detail.cta.pendingMessage) {
      this.statusMessage.set(screen.detail.cta.pendingMessage);
      return;
    }
    await this.startWorkout(false);
  }

  private async startWorkout(replaceActive: boolean): Promise<void> {
    this.starting.set(true);
    this.statusMessage.set('');
    try {
      const result = await this.logs.start(this.sessionId(), { replaceActive });
      switch (result.kind) {
        case 'started':
        case 'resumed':
          void this.nav.navigateForward(activeWorkoutPath(this.sessionId()));
          return;
        case 'conflict':
          this.conflict.set(result.active);
          this.conflictOpen.set(true);
          return;
        default:
          this.statusMessage.set(this.copy.startFailed);
      }
    } finally {
      this.starting.set(false);
    }
  }

  protected resumeOther(): void {
    const other = this.conflict();
    this.conflictOpen.set(false);
    if (other) {
      void this.nav.navigateForward(activeWorkoutPath(other.source.sessionId));
    }
  }

  protected async replaceAndStart(): Promise<void> {
    this.conflictOpen.set(false);
    await this.startWorkout(true);
  }

  protected cancelConflict(): void {
    this.conflictOpen.set(false);
  }

  protected retry(): void {
    this.statusMessage.set('');
    this.state.reload();
  }

  protected backToWorkout(): void {
    void this.nav.navigateBack(WORKOUT_PATH);
  }
}
