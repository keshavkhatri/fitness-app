import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, resource, signal } from '@angular/core';
import { IonBackButton, IonContent, IonIcon, NavController } from '@ionic/angular';

import { ThemeService } from '../../../core/theme/theme.service';
import { WorkoutHistoryService } from '../../../core/workout/workout-history.service';
import { EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { sessionTypePhoto } from '../workout-photos';
import { WorkoutArtComponent } from '../../home/components/workout-art/workout-art.component';
import { HistoryFilter, HistoryScreen, filterHistory, toHistoryScreen } from './history-view-model';

/**
 * Finished workouts, newest first, grouped by local month; a filter by session
 * type when the history has more than one. Immersive (dark), like the record
 * it opens. Read-only.
 */
@Component({
  selector: 'app-workout-history',
  templateUrl: './workout-history.page.html',
  styleUrl: './workout-history.page.scss',
  host: { class: 'fit-theme-immersive' },
  imports: [
    IonBackButton,
    IonContent,
    IonIcon,
    WorkoutArtComponent,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkoutHistoryPage {
  private readonly history = inject(WorkoutHistoryService);
  private readonly nav = inject(NavController);

  protected readonly copy = WORKOUT_COPY.history;
  protected readonly sessionPhoto = sessionTypePhoto;
  private readonly state = resource({
    loader: async () => {
      return toHistoryScreen(await this.history.list());
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

  /** The selected session type (UI state only). */
  protected readonly filter = signal<HistoryFilter>('all');
  protected readonly months = computed(() => {
    const screen = this.screen();
    return screen?.kind === 'ready' ? filterHistory(screen.months, this.filter()) : [];
  });

  constructor() {
    // Light status-bar text while this always-dark screen is open.
    const releaseStatusBar = inject(ThemeService).holdAlwaysDark();
    inject(DestroyRef).onDestroy(releaseStatusBar);
  }

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
