import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { WorkoutArtComponent } from '../../home/components/workout-art/workout-art.component';
import { WORKOUT_COPY } from '../workout-content';
import { HistoryExerciseView } from './history-view-model';

/**
 * A finished workout's exercises in recorded order: one card each with the
 * best set ("Max"), then every set as recorded. Status is shown by icon and
 * text (done, skipped, not done). Read-only.
 */
@Component({
  selector: 'app-history-exercise-list',
  template: `
    <ol class="exercise-list">
      @for (exercise of exercises(); track exercise.key) {
        <li class="exercise" data-testid="history-exercise">
          <div class="head">
            <span class="thumb" aria-hidden="true"><app-workout-art [seed]="exercise.exerciseId" /></span>
            <div class="identity">
              <h3 class="name">{{ exercise.name }}</h3>
              <p class="count">{{ exercise.setsLabel }}<span class="visually-hidden">, {{ exercise.progress }}</span></p>
            </div>
            @if (exercise.best; as best) {
              <p class="best" data-testid="history-best">
                <span class="best-label">{{ copy.detail.max }}<span class="visually-hidden">:</span></span>&ngsp;
                <span class="best-value">{{ best }}</span>
              </p>
            }
          </div>
          <ol class="sets" [attr.aria-label]="copy.detail.actualSets(exercise.name)" data-testid="actual-sets">
            @for (set of exercise.sets; track set.key) {
              <li class="set" [attr.data-status]="set.status">
                <span class="set-number" aria-hidden="true">{{ set.setNumber }}</span>
                <span class="visually-hidden">{{ set.label }}: </span>
                <span class="set-value">{{ set.value }}</span>
                <span class="set-status" aria-hidden="true">
                  @switch (set.status) {
                    @case ('completed') {
                      <ion-icon name="checkmark" />
                    }
                    @case ('skipped') {
                      <ion-icon name="remove" />
                    }
                  }
                </span>
              </li>
            }
          </ol>
        </li>
      }
    </ol>
  `,
  styleUrl: './history-exercise-list.component.scss',
  imports: [IonIcon, WorkoutArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryExerciseListComponent {
  readonly exercises = input.required<readonly HistoryExerciseView[]>();

  protected readonly copy = WORKOUT_COPY.history;
}
