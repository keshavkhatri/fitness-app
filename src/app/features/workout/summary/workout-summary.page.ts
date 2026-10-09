import { ChangeDetectionStrategy, Component, computed, inject, input, resource } from '@angular/core';
import { IonContent, IonFooter, IonHeader, IonIcon, IonToolbar, NavController } from '@ionic/angular';

import { WorkoutLogService } from '../../../core/workout/workout-log.service';
import { EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { toWorkoutSummaryView } from './workout-summary-view-model';

/** Minimal completion screen for a finished workout. Done returns to Workout. */
@Component({
  selector: 'app-workout-summary',
  template: `
    <ion-header class="ion-no-border"><ion-toolbar></ion-toolbar></ion-header>
    <ion-content>
      <main class="body">
        <p class="visually-hidden" role="status">{{ state.isLoading() ? copy.loading : '' }}</p>
        @if (view(); as v) {
          <header class="hero" data-testid="summary">
            <span class="icon" [class.partial]="!v.fullyCompleted" aria-hidden="true">
              <ion-icon [name]="v.fullyCompleted ? 'checkmark-circle' : 'flag-outline'" />
            </span>
            <h1 class="title">{{ v.heading }}</h1>
            <p class="name" data-testid="summary-name">{{ v.workoutName }}</p>
            <p class="status" data-testid="summary-status">{{ v.status }}</p>
          </header>
          <dl class="facts" data-testid="summary-facts">
            @for (fact of v.facts; track fact.key) {
              <div class="fact" [attr.data-key]="fact.key">
                <dt>{{ fact.label }}</dt>
                <dd>{{ fact.value }}</dd>
              </div>
            }
          </dl>
        } @else if (state.isLoading()) {
          <h1 class="visually-hidden">{{ copy.title }}</h1>
          <div class="loading" aria-busy="true">
            <fit-skeleton width="60%" height="34px" />
            <fit-skeleton height="160px" radius="card" />
          </div>
        } @else {
          <h1 class="visually-hidden">{{ copy.notFound.title }}</h1>
          <fit-card data-testid="summary-not-found">
            <fit-empty-state icon="barbell-outline" [title]="copy.notFound.title" [description]="copy.notFound.message" />
          </fit-card>
        }
      </main>
    </ion-content>
    <ion-footer class="ion-no-border">
      <div class="footer">
        <button fit-button type="button" size="lg" block (click)="done()">{{ copy.done }}</button>
      </div>
    </ion-footer>
  `,
  styleUrl: './workout-summary.page.scss',
  imports: [IonHeader, IonToolbar, IonContent, IonFooter, IonIcon, EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkoutSummaryPage {
  /** Route parameter (`/workout/summary/:workoutId`). */
  readonly workoutId = input.required<string>();

  private readonly logs = inject(WorkoutLogService);
  private readonly nav = inject(NavController);

  protected readonly copy = WORKOUT_COPY.summary;
  protected readonly state = resource({
    params: () => ({ id: this.workoutId() }),
    loader: ({ params }) => this.logs.loadCompleted(params.id),
  });
  protected readonly view = computed(() => {
    const log = this.state.hasValue() ? this.state.value() : null;
    return log ? toWorkoutSummaryView(log) : null;
  });

  protected done(): void {
    void this.nav.navigateRoot('/workout');
  }
}
