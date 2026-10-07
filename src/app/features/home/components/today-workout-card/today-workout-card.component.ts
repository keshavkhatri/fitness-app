import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';

import { FitnessButtonComponent, FitnessCardComponent } from '../../../../shared/ui';
import { TodayWorkoutSummary } from '../../home.models';

@Component({
  selector: 'app-today-workout-card',
  template: `
    <fit-card>
      @if (workout(); as w) {
        <h3 class="name">{{ w.name }}</h3>
        <p class="focus">{{ w.focus }}</p>
        <ul class="meta">
          <li><ion-icon name="barbell-outline" aria-hidden="true" />{{ w.exerciseCount }} exercises</li>
          <li><ion-icon name="time-outline" aria-hidden="true" />About {{ w.estimatedMinutes }} min</li>
        </ul>
        <a fit-button block icon="play-outline" routerLink="/workout">Start workout</a>
      } @else {
        <h3 class="name">Rest day</h3>
        <p class="focus">Nothing scheduled today. Recovery is part of the plan.</p>
      }
    </fit-card>
  `,
  styleUrl: './today-workout-card.component.scss',
  imports: [IonIcon, RouterLink, FitnessButtonComponent, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodayWorkoutCardComponent {
  readonly workout = input.required<TodayWorkoutSummary | null>();
}
