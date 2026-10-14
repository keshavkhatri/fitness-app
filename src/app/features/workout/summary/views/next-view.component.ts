import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { WORKOUT_COPY } from '../../workout-content';

/** The plan's next training day after today, or null (no plan, or it couldn't be read). */
export interface NextWorkoutView {
  readonly title: string;
  readonly weekday: string;
  readonly sessionId: string;
}

export type SummaryNextAction = 'next-workout' | 'nutrition' | 'progress';

/** What's next (light): the next planned workout and where to go from here. */
@Component({
  selector: 'app-summary-next',
  template: `
    <header class="hero">
      <span class="mark" aria-hidden="true"><ion-icon name="rocket-outline" /></span>
      <h1 class="title" tabindex="-1" data-view-heading>{{ copy.title }}</h1>
      <p class="lead">{{ copy.intro }}</p>
    </header>

    <ul class="cards">
      <li>
        <button type="button" class="card" data-testid="next-workout" [disabled]="busy()" (click)="selected.emit('next-workout')">
          <span class="icon" aria-hidden="true"><ion-icon name="calendar-outline" /></span>
          <span class="text">
            <span class="card-title">{{ copy.nextWorkout }}</span>&ngsp;
            <span class="card-text">
              @if (nextWorkout(); as next) {
                {{ copy.nextWorkoutValue(next.title, next.weekday) }}
              } @else {
                {{ copy.noNextWorkout }}
              }
            </span>
          </span>
          <ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
        </button>
      </li>
      <li>
        <button type="button" class="card" data-testid="next-nutrition" [disabled]="busy()" (click)="selected.emit('nutrition')">
          <span class="icon" aria-hidden="true"><ion-icon name="restaurant-outline" /></span>
          <span class="text">
            <span class="card-title">{{ copy.nutrition.title }}</span>&ngsp;
            <span class="card-text">{{ copy.nutrition.text }}</span>
          </span>
          <ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
        </button>
      </li>
      <li>
        <button type="button" class="card" data-testid="next-progress" [disabled]="busy()" (click)="selected.emit('progress')">
          <span class="icon" aria-hidden="true"><ion-icon name="stats-chart" /></span>
          <span class="text">
            <span class="card-title">{{ copy.progress.title }}</span>&ngsp;
            <span class="card-text">{{ copy.progress.text }}</span>
          </span>
          <ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
        </button>
      </li>
      <li>
        <!-- Advice only: there is no recovery feature to open, so this isn't a button. -->
        <div class="card static" data-testid="next-recover">
          <span class="icon" aria-hidden="true"><ion-icon name="moon-outline" /></span>
          <span class="text">
            <span class="card-title">{{ copy.recover.title }}</span>&ngsp;
            <span class="card-text">{{ copy.recover.text }}</span>
          </span>
        </div>
      </li>
    </ul>
  `,
  styleUrl: './next-view.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SummaryNextComponent {
  readonly nextWorkout = input<NextWorkoutView | null>(null);
  readonly busy = input(false);
  readonly selected = output<SummaryNextAction>();
  protected readonly copy = WORKOUT_COPY.summary.next;
}
