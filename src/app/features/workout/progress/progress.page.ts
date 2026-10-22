import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { IonBackButton, IonIcon, NavController } from '@ionic/angular';

import { BodyCompositionHistoryService } from '../../../core/body-composition/body-composition-history.service';
import { WeightHistoryService } from '../../../core/body-measurements/weight-history.service';
import { UserIdentityService } from '../../../core/identity/user-identity.service';
import { CLOCK } from '../../../core/time/clock';
import { WorkoutHistoryService } from '../../../core/workout/workout-history.service';
import { WorkoutPlanService } from '../../../core/workout/workout-plan.service';
import { WeightRange, weightRangeSummary } from '../../../domain/body-measurements';
import { performedExercises } from '../../../domain/workout-session';
import {
  EmptyStateComponent,
  FitnessAvatarComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  PageLayoutComponent,
  SegmentOption,
  SegmentedControlComponent,
} from '../../../shared/ui';
import { BodyCompositionMetric } from '../../../domain/body-composition';
import { inStack } from '../../../core/navigation/stack-nav';
import { BODY_COMPOSITION_HISTORY_PATH, NEW_BODY_COMPOSITION_PATH } from '../../body-composition/body-composition-paths';
import { MEASUREMENT_HISTORY_PATH } from '../../body-measurements/measurement-paths';
import { NEW_WEIGHT_PATH, WEIGHT_HISTORY_PATH } from '../../body-weight/weight-history-paths';
import { PointChartView, toTrendSummary, weightChart } from '../../body-weight/weight-trend-view-model';
import { ReviewEntryComponent } from '../../fitness-review/components/review-entry.component';
import { FITNESS_REVIEW_PATH } from '../../fitness-review/fitness-review-paths';
import { WORKOUT_COPY } from '../workout-content';
import { BodyMetricCardsComponent } from './body-metric-cards.component';
import { ConsistencyCardComponent } from './consistency-card.component';
import { toExerciseRow } from './exercise-list-view-model';
import { ExerciseRowListComponent } from './exercise-row-list.component';
import { progressBaseOf } from './progress-paths';
import { BodyComparison, BodyMetricView, KeyMetricView, ProgressWorkoutsView, toBodyMetrics, toProgressWorkouts } from './progress-view-model';
import { WeightTrendCardComponent, WeightTrendState } from './weight-trend-card.component';
import { CompositionTrendCardComponent } from './composition-trend-card.component';
import { CompositionTrendView, toCompositionTrend } from './composition-trend-view-model';

type ProgressView = 'overview' | 'workout' | 'body';

/** Exercises previewed on the overview (the rest are one tap away). */
export const EXERCISE_PREVIEW_LIMIT = 4;

/**
 * Progress overview: latest body recordings and the weight trend; training
 * consistency, totals and recent exercises. The Overview / Workout / Body
 * switch shows all of it or one half (UI state only). Every value is a
 * recording (weigh-ins, body-composition reports, finished workouts); each
 * part has its own loading, empty and error state.
 */
@Component({
  selector: 'app-progress',
  templateUrl: './progress.page.html',
  styleUrl: './progress.page.scss',
  host: { class: 'fit-theme-dashboard' },
  imports: [
    IonBackButton,
    IonIcon,
    EmptyStateComponent,
    FitnessAvatarComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    PageLayoutComponent,
    SegmentedControlComponent,
    ReviewEntryComponent,
    BodyMetricCardsComponent,
    ConsistencyCardComponent,
    ExerciseRowListComponent,
    WeightTrendCardComponent,
    CompositionTrendCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressPage {
  private readonly history = inject(WorkoutHistoryService);
  private readonly plans = inject(WorkoutPlanService);
  private readonly weights = inject(WeightHistoryService);
  private readonly composition = inject(BodyCompositionHistoryService);
  private readonly identityService = inject(UserIdentityService);
  private readonly clock = inject(CLOCK);
  private readonly nav = inject(NavController);
  private readonly router = inject(Router);
  /** `/progress` (its own tab) or `/you/progress` (pushed from You: a back button, no avatar). */
  private readonly route = inject(ActivatedRoute);
  protected readonly base = progressBaseOf(this.route);
  protected readonly inYou = this.base === '/you/progress';
  /** A body section (weight history, body composition, measurements) in this page's own stack, so Back returns here. */
  private bodyPath<T extends string | readonly string[]>(path: T): T {
    return this.inYou ? path : inStack(path, '/progress');
  }

  protected readonly copy = WORKOUT_COPY.progress;
  protected readonly view = signal<ProgressView>('overview');
  /** A link can open a section (`?view=workout`, e.g. Home's "This week"); the tab page stays alive, so every visit counts. */
  private readonly linkedView = this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
    const view = params.get('view');
    if (view === 'overview' || view === 'workout' || view === 'body') {
      this.view.set(view);
    }
  });
  protected readonly views: readonly SegmentOption<ProgressView>[] = (['overview', 'workout', 'body'] as const).map((value) => ({
    value,
    label: this.copy.view[value],
  }));
  protected readonly metricIcon: Readonly<Record<KeyMetricView['key'], string>> = {
    workouts: 'barbell',
    volume: 'stats-chart',
    duration: 'time-outline',
  };

  // --- Workouts ------------------------------------------------------------------------------
  private readonly workoutState = resource({
    loader: async () => {
      const [result, plan] = await Promise.all([this.history.list(), this.plans.load().catch(() => null)]);
      // The current plan's resistance sessions per week: a reference, not a target met or missed.
      const planned = plan?.kind === 'ready' ? plan.plan.sessions.filter((s) => s.kind === 'resistance').length : null;
      return { result, view: toProgressWorkouts(result, planned || null, this.clock()) };
    },
  });
  protected readonly workouts = computed<ProgressWorkoutsView | null>(() => {
    if (this.workoutState.hasValue()) {
      return this.workoutState.value().view;
    }
    return this.workoutState.error() ? { kind: 'error' } : null;
  });
  protected readonly exerciseRows = computed(() => {
    const result = this.workoutState.hasValue() ? this.workoutState.value().result : null;
    return result?.ok ? performedExercises(result.workouts).slice(0, EXERCISE_PREVIEW_LIMIT).map((p) => toExerciseRow(p, this.clock())) : [];
  });

  // --- Body ------------------------------------------------------------------------------------
  /** The body cards' change: since the last recording, or since the first (how far you've come). */
  protected readonly bodyComparison = signal<BodyComparison>('previous');
  protected readonly comparisonOptions: readonly SegmentOption<BodyComparison>[] = (['previous', 'first'] as const).map((value) => ({
    value,
    label: this.copy.body.compare[value],
  }));
  protected readonly bodyMetrics = computed<readonly BodyMetricView[]>(() =>
    toBodyMetrics(this.weights.state(), this.composition.state(), this.weights.today(), this.bodyComparison()),
  );

  /** Kept while the page is open (not persisted). */
  protected readonly weightRange = signal<WeightRange>('90d');
  protected readonly weightState = computed<WeightTrendState>(() => {
    const s = this.weights.state();
    return s.status === 'ready' ? (s.entries.length ? 'ready' : 'none') : s.status;
  });
  private readonly weightSummary = computed(() => {
    const s = this.weights.state();
    return s.status === 'ready' ? weightRangeSummary(s.entries, this.weightRange(), this.weights.today(), s.unitSystem) : null;
  });
  protected readonly weightTrend = computed(() => {
    const s = this.weights.state();
    const summary = this.weightSummary();
    return summary && s.status === 'ready' ? toTrendSummary(summary, this.weightRange(), s.unitSystem, this.weights.today()) : null;
  });
  /** The weight history's own chart; null when it can't be built (the latest value still shows). */
  protected readonly weightChart = computed<PointChartView | null>(() => {
    const s = this.weights.state();
    const summary = this.weightSummary();
    if (!summary || s.status !== 'ready') {
      return null;
    }
    try {
      return weightChart.build(summary, s.unitSystem, this.weights.today());
    } catch {
      return null;
    }
  });

  /** Body fat, muscle and the rest over time: the chosen metric and range (kept while the page is open). */
  protected readonly compositionMetric = signal<BodyCompositionMetric | null>(null);
  /** All time by default: reports are weeks apart, so shorter windows often hold one point. */
  protected readonly compositionRange = signal<WeightRange>('all');
  protected readonly compositionTrend = computed<CompositionTrendView | null>(() => {
    const s = this.composition.state();
    return s.status === 'ready' ? toCompositionTrend(s.assessments, this.compositionMetric(), this.compositionRange(), this.weights.today()) : null;
  });

  // --- Header ----------------------------------------------------------------------------------
  private readonly identity = resource({ loader: () => this.identityService.load() });
  protected readonly identityName = computed(() => (this.identity.hasValue() ? this.identity.value().name : null));
  protected readonly identityPhoto = computed(() => (this.identity.hasValue() ? this.identity.value().photo : null));

  protected readonly announcement = computed(() => {
    switch (this.workouts()?.kind) {
      case undefined:
        return this.copy.loading;
      case 'error':
        return this.copy.error.title;
      default:
        return '';
    }
  });

  constructor() {
    void this.weights.load();
    void this.composition.load();
  }

  private entered = false;

  /** Returning after a workout or a new recording: refresh. */
  ionViewWillEnter(): void {
    if (this.entered) {
      this.workoutState.reload();
      this.identity.reload();
      void this.weights.load();
      void this.composition.load();
    }
    this.entered = true;
  }

  protected openExercise(exerciseId: string): void {
    void this.nav.navigateForward([this.base, 'exercise', exerciseId]);
  }

  protected viewAll(): void {
    void this.nav.navigateForward([this.base, 'exercises']);
  }

  protected openBodyMetric(key: BodyMetricView['key']): void {
    if (key === 'weight') {
      this.openWeightHistory();
    } else {
      this.openBodyComposition();
    }
  }

  protected openWeightHistory(): void {
    void this.nav.navigateForward(this.bodyPath(WEIGHT_HISTORY_PATH));
  }

  protected addWeight(): void {
    void this.nav.navigateForward(this.bodyPath(NEW_WEIGHT_PATH));
  }

  protected addBodyComposition(): void {
    void this.nav.navigateForward(this.bodyPath(NEW_BODY_COMPOSITION_PATH));
  }

  protected openBodyComposition(): void {
    void this.nav.navigateForward(this.bodyPath(BODY_COMPOSITION_HISTORY_PATH));
  }

  protected openMeasurements(): void {
    void this.nav.navigateForward(this.bodyPath(MEASUREMENT_HISTORY_PATH));
  }

  protected openReview(): void {
    void this.nav.navigateForward(FITNESS_REVIEW_PATH);
  }

  protected openYou(): void {
    void this.router.navigateByUrl('/you');
  }

  protected viewWorkout(): void {
    void this.nav.navigateRoot('/workout');
  }

  protected retry(): void {
    this.workoutState.reload();
  }
}
