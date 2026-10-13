import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonBackButton, IonIcon, NavController } from '@ionic/angular';

import { BodyCompositionHistoryService } from '../../../core/body-composition/body-composition-history.service';
import { WeightHistoryService } from '../../../core/body-measurements/weight-history.service';
import { UserIdentityService } from '../../../core/identity/user-identity.service';
import { CLOCK } from '../../../core/time/clock';
import { WorkoutHistoryService } from '../../../core/workout/workout-history.service';
import { WorkoutPlanService } from '../../../core/workout/workout-plan.service';
import { WeightRange, rangeStart, weightRangeSummary } from '../../../domain/body-measurements';
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
import { BODY_COMPOSITION_HISTORY_PATH } from '../../body-composition/body-composition-paths';
import { MEASUREMENT_HISTORY_PATH } from '../../body-measurements/measurement-paths';
import { NEW_WEIGHT_PATH, WEIGHT_HISTORY_PATH } from '../../body-weight/weight-history-paths';
import { WeightChartView, axisDateLabel, toTrendSummary, weightChart } from '../../body-weight/weight-trend-view-model';
import { ReviewEntryComponent } from '../../fitness-review/components/review-entry.component';
import { FITNESS_REVIEW_PATH } from '../../fitness-review/fitness-review-paths';
import { WORKOUT_COPY } from '../workout-content';
import { BodyMetricCardsComponent } from './body-metric-cards.component';
import { ConsistencyCardComponent } from './consistency-card.component';
import { toExerciseRow } from './exercise-list-view-model';
import { ExerciseRowListComponent } from './exercise-row-list.component';
import { progressBaseOf } from './progress-paths';
import { BodyMetricView, KeyMetricView, ProgressWorkoutsView, toBodyMetrics, toProgressWorkouts } from './progress-view-model';
import { WeightTrendCardComponent, WeightTrendState } from './weight-trend-card.component';

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
  protected readonly base = progressBaseOf(inject(ActivatedRoute));
  protected readonly inYou = this.base === '/you/progress';

  protected readonly copy = WORKOUT_COPY.progress;
  protected readonly view = signal<ProgressView>('overview');
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
  protected readonly bodyMetrics = computed<readonly BodyMetricView[]>(() =>
    toBodyMetrics(this.weights.state(), this.composition.state(), this.weights.today()),
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
  protected readonly weightChart = computed<WeightChartView | null>(() => {
    const s = this.weights.state();
    const summary = this.weightSummary();
    if (!summary || s.status !== 'ready') {
      return null;
    }
    const today = this.weights.today();
    const start = rangeStart(this.weightRange(), today) ?? summary.first.entry.date;
    try {
      return weightChart.build(summary, start, today, s.unitSystem, { start: axisDateLabel(start, today), end: axisDateLabel(today, today) });
    } catch {
      return null;
    }
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
    void this.nav.navigateForward(WEIGHT_HISTORY_PATH);
  }

  protected addWeight(): void {
    void this.nav.navigateForward(NEW_WEIGHT_PATH);
  }

  protected openBodyComposition(): void {
    void this.nav.navigateForward(BODY_COMPOSITION_HISTORY_PATH);
  }

  protected openMeasurements(): void {
    void this.nav.navigateForward(MEASUREMENT_HISTORY_PATH);
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
