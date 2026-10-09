import { ChangeDetectionStrategy, Component, computed, inject, input, resource } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, NavController } from '@ionic/angular';

import { CLOCK } from '../../../core/time/clock';
import { WorkoutHistoryService } from '../../../core/workout/workout-history.service';
import { EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { ExercisePerformanceView, toExercisePerformance } from './progress-view-model';

type Screen = { readonly kind: 'ready'; readonly view: ExercisePerformanceView } | { readonly kind: 'not-found' } | { readonly kind: 'error' };

/**
 * One exercise's actual performance over time: latest and recent best top
 * sets, then each recent session's completed sets. Grouped by exercise id.
 */
@Component({
  selector: 'app-exercise-performance',
  templateUrl: './exercise-performance.page.html',
  styleUrl: './exercise-performance.page.scss',
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExercisePerformancePage {
  /** Route parameter (`/you/progress/exercise/:exerciseId`). */
  readonly exerciseId = input.required<string>();

  private readonly history = inject(WorkoutHistoryService);
  private readonly clock = inject(CLOCK);
  private readonly nav = inject(NavController);

  protected readonly copy = WORKOUT_COPY.progress;
  protected readonly state = resource({
    params: () => ({ id: this.exerciseId() }),
    loader: async ({ params }): Promise<Screen> => {
      const result = await this.history.progress();
      if (!result.ok) {
        return { kind: 'error' };
      }
      const performance = result.exercises.find((p) => p.exerciseId === params.id);
      return performance ? { kind: 'ready', view: toExercisePerformance(performance, this.clock()) } : { kind: 'not-found' };
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

  protected backToProgress(): void {
    void this.nav.navigateBack('/you/progress');
  }
}
