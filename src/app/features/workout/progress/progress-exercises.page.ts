import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, NavController } from '@ionic/angular';

import { CLOCK } from '../../../core/time/clock';
import { WorkoutHistoryService } from '../../../core/workout/workout-history.service';
import { EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { PerformanceCardListComponent } from './performance-card-list.component';
import { toExerciseList } from './progress-view-model';

/** Every exercise the user has completed sets for, most recently performed first. */
@Component({
  selector: 'app-progress-exercises',
  template: `
    <ion-header class="ion-no-border subpage-header">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/you/progress" [text]="copy.back" /></ion-buttons>
        <ion-title aria-hidden="true">{{ copy.title }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main class="body">
        <header>
          <h1 class="title">{{ copy.exercises.title }}</h1>
          <p class="subtitle">{{ copy.exercises.subtitle }}</p>
        </header>
        <p class="visually-hidden" role="status">{{ state.isLoading() ? copy.loading : items() === null ? copy.error.title : '' }}</p>
        @if (items(); as list) {
          <app-performance-card-list [items]="list" (openExercise)="open($event)" />
        } @else if (state.isLoading()) {
          <div class="loading" aria-busy="true"><fit-skeleton height="240px" radius="card" /></div>
        } @else {
          <fit-card data-testid="exercises-error">
            <fit-empty-state icon="alert-circle-outline" [title]="copy.error.title" [description]="copy.error.message">
              <button fit-button type="button" (click)="state.reload()">{{ copy.error.retry }}</button>
            </fit-empty-state>
          </fit-card>
        }
      </main>
    </ion-content>
  `,
  styleUrl: './progress-exercises.page.scss',
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
    PerformanceCardListComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressExercisesPage {
  private readonly history = inject(WorkoutHistoryService);
  private readonly clock = inject(CLOCK);
  private readonly nav = inject(NavController);

  protected readonly copy = WORKOUT_COPY.progress;
  protected readonly state = resource({ loader: async () => toExerciseList(await this.history.progress(), this.clock()) });
  protected readonly items = computed(() => (this.state.hasValue() ? this.state.value() : null));

  protected open(exerciseId: string): void {
    void this.nav.navigateForward(['/you', 'progress', 'exercise', exerciseId]);
  }
}
