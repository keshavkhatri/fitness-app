import { ChangeDetectionStrategy, Component, computed, inject, input, resource } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, NavController } from '@ionic/angular';

import { CLOCK } from '../../../core/time/clock';
import { WorkoutHistoryService } from '../../../core/workout/workout-history.service';
import { EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { HistoryExerciseListComponent } from './history-exercise-list.component';
import { toHistoryDetail } from './history-view-model';

/**
 * A finished workout, read-only: what was planned at the time and what was
 * actually done, side by side. Rendered from the log's own snapshot only.
 */
@Component({
  selector: 'app-workout-history-detail',
  templateUrl: './workout-history-detail.page.html',
  styleUrl: './workout-history-detail.page.scss',
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonIcon,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    HistoryExerciseListComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkoutHistoryDetailPage {
  /** Route parameter (`/workout/history/:workoutId`). */
  readonly workoutId = input.required<string>();

  private readonly history = inject(WorkoutHistoryService);
  private readonly clock = inject(CLOCK);
  private readonly nav = inject(NavController);

  protected readonly copy = WORKOUT_COPY.history;
  protected readonly state = resource({
    params: () => ({ id: this.workoutId() }),
    loader: ({ params }) => this.history.get(params.id),
  });
  protected readonly view = computed(() => {
    const log = this.state.hasValue() ? this.state.value() : null;
    return log ? toHistoryDetail(log, this.clock()) : null;
  });

  protected backToHistory(): void {
    void this.nav.navigateBack('/workout/history');
  }
}
