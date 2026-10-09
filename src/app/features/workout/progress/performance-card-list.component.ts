import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { WORKOUT_COPY } from '../workout-content';
import { PerformanceCardView } from './progress-view-model';

/** Exercises with their latest actual performance; each opens its performance detail. */
@Component({
  selector: 'app-performance-card-list',
  template: `
    <ul class="list">
      @for (item of items(); track item.exerciseId) {
        <li>
          <button type="button" class="item" data-testid="performance-item" (click)="openExercise.emit(item.exerciseId)">
            <span class="text">
              <span class="name">{{ item.name }}</span>&ngsp;
              <span class="latest"><span class="label">{{ copy.latest }}</span>&ngsp;<span class="value">{{ item.latest }}</span></span>&ngsp;
              <span class="date">{{ item.lastPerformed }}</span>
            </span>
            <ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
          </button>
        </li>
      }
    </ul>
  `,
  styleUrl: './performance-card-list.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerformanceCardListComponent {
  readonly items = input.required<readonly PerformanceCardView[]>();
  readonly openExercise = output<string>();

  protected readonly copy = WORKOUT_COPY.progress.recent;
}
