import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, resource, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonBackButton, IonContent, IonIcon, NavController } from '@ionic/angular';

import { ThemeService } from '../../../core/theme/theme.service';
import { CLOCK } from '../../../core/time/clock';
import { WorkoutHistoryService } from '../../../core/workout/workout-history.service';
import {
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  SegmentOption,
  SegmentedControlComponent,
} from '../../../shared/ui';
import { WorkoutArtComponent } from '../../home/components/workout-art/workout-art.component';
import { WORKOUT_COPY } from '../workout-content';
import { exercisePhoto } from '../workout-photos';
import { HistoryExerciseListComponent } from './history-exercise-list.component';
import { HistorySummaryComponent } from './history-summary.component';
import { HistoryMetricView, toHistoryDetail } from './history-view-model';

/**
 * A finished workout, read-only: a hero with the date, duration and status,
 * the recorded totals, then each exercise's sets (Exercises) or the totals and
 * what was planned at the time (Summary). Rendered from the log's own
 * snapshot only; viewing never changes it.
 */
@Component({
  selector: 'app-workout-history-detail',
  templateUrl: './workout-history-detail.page.html',
  styleUrl: './workout-history-detail.page.scss',
  host: { class: 'fit-theme-immersive' },
  imports: [
    IonBackButton,
    IonContent,
    IonIcon,
    SegmentedControlComponent,
    WorkoutArtComponent,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    HistoryExerciseListComponent,
    HistorySummaryComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkoutHistoryDetailPage {
  /** Route parameter (`/workout/history/:workoutId`). */
  readonly workoutId = input.required<string>();

  private readonly history = inject(WorkoutHistoryService);
  private readonly clock = inject(CLOCK);
  private readonly nav = inject(NavController);
  private readonly route = inject(ActivatedRoute);

  protected readonly copy = WORKOUT_COPY.history;
  protected readonly photo = exercisePhoto;
  protected readonly state = resource({
    params: () => ({ id: this.workoutId() }),
    loader: ({ params }) => this.history.get(params.id),
  });
  protected readonly view = computed(() => {
    const log = this.state.hasValue() ? this.state.value() : null;
    return log ? toHistoryDetail(log, this.clock()) : null;
  });

  protected readonly tab = signal<'exercises' | 'summary'>('exercises');
  protected readonly tabs: readonly SegmentOption<'exercises' | 'summary'>[] = [
    { value: 'exercises', label: this.copy.detail.exercisesTab },
    { value: 'summary', label: this.copy.detail.summaryTab },
  ];
  protected readonly metricIcon: Readonly<Record<HistoryMetricView['key'], string>> = {
    exercises: 'barbell-outline',
    sets: 'list-outline',
    volume: 'flame',
  };

  constructor() {
    // Light status-bar text while this always-dark screen is open.
    const releaseStatusBar = inject(ThemeService).holdAlwaysDark();
    inject(DestroyRef).onDestroy(releaseStatusBar);
  }

  /**
   * The exercise's performance in Progress: within this stack when the record
   * was opened from Progress (…/progress/workout/:id), else the Progress tab.
   */
  protected openExercise(exerciseId: string): void {
    const segments = this.route.snapshot.pathFromRoot.flatMap((r) => r.url.map((u) => u.path));
    const base = segments[0] === 'you' && segments[1] === 'progress' ? '/you/progress' : '/progress';
    void this.nav.navigateForward([base, 'exercise', exerciseId]);
  }

  protected backToHistory(): void {
    void this.nav.navigateBack('/workout/history');
  }
}
