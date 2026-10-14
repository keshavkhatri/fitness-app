import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, resource, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonBackButton, IonContent, IonIcon, NavController } from '@ionic/angular';

import { ThemeService } from '../../../core/theme/theme.service';
import { CLOCK } from '../../../core/time/clock';
import { WorkoutHistoryService } from '../../../core/workout/workout-history.service';
import { ExercisePerformance, exercisePerformance } from '../../../domain/workout-session';
import {
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  SegmentOption,
  SegmentedControlComponent,
} from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { PerformanceMetric, PerformanceRange, toExercisePerformanceView } from './exercise-performance-view-model';
import { PerformanceChartComponent } from './performance-chart.component';
import { PerformanceSessionListComponent } from './performance-session-list.component';
import { progressBaseOf } from './progress-paths';

type Screen = { readonly kind: 'ready'; readonly performance: ExercisePerformance } | { readonly kind: 'not-found' } | { readonly kind: 'error' };

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Sessions listed before "Show all". */
export const SESSION_PREVIEW = 5;

/**
 * One exercise over time (immersive, always dark): a time range, the best
 * set in it and the change of the charted metric, a chart of one recorded
 * value per session, and the sessions, each opening its workout record (the
 * existing history detail). Grouped by the exercise id stored in the logs.
 */
@Component({
  selector: 'app-exercise-performance',
  templateUrl: './exercise-performance.page.html',
  styleUrl: './exercise-performance.page.scss',
  host: { class: 'fit-theme-immersive' },
  imports: [
    IonBackButton,
    IonContent,
    IonIcon,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    SegmentedControlComponent,
    PerformanceChartComponent,
    PerformanceSessionListComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExercisePerformancePage {
  /** Route parameter (`…/progress/exercise/:exerciseId`). */
  readonly exerciseId = input.required<string>();

  private readonly history = inject(WorkoutHistoryService);
  private readonly clock = inject(CLOCK);
  private readonly nav = inject(NavController);
  protected readonly base = progressBaseOf(inject(ActivatedRoute));

  protected readonly copy = WORKOUT_COPY.progress;
  protected readonly detail = WORKOUT_COPY.progress.detail;

  protected readonly state = resource({
    params: () => ({ id: this.exerciseId() }),
    loader: async ({ params }): Promise<Screen> => {
      const result = await this.history.list();
      if (!result.ok) {
        return { kind: 'error' };
      }
      const performance = exercisePerformance(result.workouts, params.id);
      return performance ? { kind: 'ready', performance } : { kind: 'not-found' };
    },
  });
  protected readonly screen = computed<Screen | null>(() => {
    if (this.state.isLoading()) {
      return null;
    }
    if (this.state.hasValue()) {
      return this.state.value();
    }
    return this.state.error() ? { kind: 'error' } : null;
  });

  // UI state only.
  protected readonly range = signal<PerformanceRange>('all');
  protected readonly metric = signal<PerformanceMetric>('weight');
  protected readonly showAll = signal(false);

  protected readonly view = computed(() => {
    const s = this.screen();
    return s?.kind === 'ready' ? toExercisePerformanceView(s.performance, { range: this.range(), metric: this.metric() }, this.clock()) : null;
  });
  protected readonly rangeOptions = computed<readonly SegmentOption<PerformanceRange>[]>(() =>
    (this.view()?.ranges ?? []).map((value) => ({ value, label: this.detail.ranges[value], spoken: capitalize(this.detail.rangeNames[value]) })),
  );
  protected readonly metricOptions = computed<readonly SegmentOption<PerformanceMetric>[]>(() =>
    (this.view()?.metrics ?? []).map((value) => ({ value, label: this.detail.metrics[value] })),
  );
  protected readonly visibleSessions = computed(() => {
    const sessions = this.view()?.sessions ?? [];
    return this.showAll() ? sessions : sessions.slice(0, SESSION_PREVIEW);
  });
  protected readonly hiddenCount = computed(() => (this.view()?.sessions.length ?? 0) - this.visibleSessions().length);

  protected readonly announcement = computed(() => {
    switch (this.screen()?.kind) {
      case undefined:
        return this.copy.loading;
      case 'not-found':
        return this.detail.notFound.title;
      case 'error':
        return this.copy.error.title;
      default:
        return '';
    }
  });

  constructor() {
    // Light status-bar text while this always-dark screen is open.
    const releaseStatusBar = inject(ThemeService).holdAlwaysDark();
    inject(DestroyRef).onDestroy(releaseStatusBar);
  }

  /** The workout this session came from: the history detail screen, in this stack (Back returns here). */
  protected openWorkout(workoutId: string): void {
    void this.nav.navigateForward([this.base, 'workout', workoutId]);
  }

  protected backToProgress(): void {
    void this.nav.navigateBack(this.base);
  }
}
