import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, NavController } from '@ionic/angular';

import { ActivatedRoute } from '@angular/router';

import { CLOCK } from '../../../core/time/clock';
import { WorkoutHistoryService } from '../../../core/workout/workout-history.service';
import { EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent } from '../../../shared/ui';
import { BODY_COMPOSITION_HISTORY_PATH } from '../../body-composition/body-composition-paths';
import { WORKOUT_COPY } from '../workout-content';
import { PerformanceCardListComponent } from './performance-card-list.component';
import { progressBaseOf } from './progress-paths';
import { ProgressScreen, toProgressScreen } from './progress-view-model';

/**
 * Progress: training consistency, activity and recent actual performance,
 * all from finished workouts. No estimates, scores or streaks.
 */
@Component({
  selector: 'app-progress',
  templateUrl: './progress.page.html',
  styleUrl: './progress.page.scss',
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
    PerformanceCardListComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressPage {
  private readonly history = inject(WorkoutHistoryService);
  private readonly clock = inject(CLOCK);
  private readonly nav = inject(NavController);
  /** `/progress` (its own tab: no back button) or `/you/progress`. */
  protected readonly base = progressBaseOf(inject(ActivatedRoute));

  protected readonly copy = WORKOUT_COPY.progress;
  private readonly state = resource({ loader: async () => toProgressScreen(await this.history.progress(), this.clock()) });

  protected readonly screen = computed<ProgressScreen | null>(() => {
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

  /** Returning after a workout: refresh. */
  ionViewWillEnter(): void {
    if (this.entered) {
      this.state.reload();
    }
    this.entered = true;
  }

  protected openExercise(exerciseId: string): void {
    void this.nav.navigateForward([this.base, 'exercise', exerciseId]);
  }

  protected viewAll(): void {
    void this.nav.navigateForward([this.base, 'exercises']);
  }

  protected openBodyComposition(): void {
    void this.nav.navigateForward(BODY_COMPOSITION_HISTORY_PATH);
  }

  protected viewWorkout(): void {
    void this.nav.navigateRoot('/workout');
  }

  protected retry(): void {
    this.state.reload();
  }
}
