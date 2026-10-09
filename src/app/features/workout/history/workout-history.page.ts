import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, NavController } from '@ionic/angular';

import { CLOCK } from '../../../core/time/clock';
import { WorkoutHistoryService } from '../../../core/workout/workout-history.service';
import { EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { HistoryScreen, toHistoryScreen } from './history-view-model';

/** Finished workouts, newest first, grouped by local day, with simple consistency counts. */
@Component({
  selector: 'app-workout-history',
  templateUrl: './workout-history.page.html',
  styleUrl: './workout-history.page.scss',
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkoutHistoryPage {
  private readonly history = inject(WorkoutHistoryService);
  private readonly clock = inject(CLOCK);
  private readonly nav = inject(NavController);

  protected readonly copy = WORKOUT_COPY.history;
  private readonly state = resource({
    loader: async () => {
      const [result, overview] = await Promise.all([this.history.list(), this.history.overview()]);
      return toHistoryScreen(result, overview, this.clock());
    },
  });

  /** null while loading; a failed load is an error state. */
  protected readonly screen = computed<HistoryScreen | null>(() => {
    if (this.state.isLoading()) {
      return null;
    }
    if (this.state.hasValue()) {
      return this.state.value();
    }
    return this.state.error() ? { kind: 'error' } : null;
  });

  protected readonly announcement = computed(() => {
    switch (this.screen()?.kind) {
      case undefined:
        return this.copy.loading;
      case 'error':
        return this.copy.error.title;
      case 'empty':
        return this.copy.empty.title;
      default:
        return '';
    }
  });

  private entered = false;

  /** Coming back from a workout's detail or a new workout: refresh. */
  ionViewWillEnter(): void {
    if (this.entered) {
      this.state.reload();
    }
    this.entered = true;
  }

  protected open(id: string): void {
    void this.nav.navigateForward(['/workout', 'history', id]);
  }

  protected retry(): void {
    this.state.reload();
  }

  protected viewWorkout(): void {
    void this.nav.navigateBack('/workout');
  }
}
