import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { WORKOUT_COPY } from '../workout-content';
import { HistoryExerciseView } from './history-view-model';

/**
 * A finished workout's exercises: the prescription at the time ("Planned")
 * and the recorded sets ("Actual"), labelled separately so one is never
 * mistaken for the other. Status is shown by icon and text.
 */
@Component({
  selector: 'app-history-exercise-list',
  template: `
    <ol class="exercise-list">
      @for (exercise of exercises(); track exercise.key) {
        <li class="exercise" data-testid="history-exercise">
          <div class="exercise-head">
            <h3 class="exercise-name">{{ exercise.heading }}</h3>
            <p class="exercise-progress">{{ exercise.progress }}</p>
          </div>
          <dl class="planned">
            <dt>{{ copy.detail.planned }}</dt>
            <dd data-testid="planned">
              @for (part of exercise.plannedParts; track $index; let first = $first) {
                @if (!first) {
                  <span class="separator" aria-hidden="true"> · </span>
                }
                <span class="part">{{ part }}</span>
              }
            </dd>
          </dl>
          <p class="actual-label" aria-hidden="true">{{ copy.detail.actual }}</p>
          <ol class="sets" [attr.aria-label]="copy.detail.actualSets(exercise.name)" data-testid="actual-sets">
            @for (set of exercise.sets; track set.key) {
              <li class="set" [attr.data-status]="set.status">
                <span class="set-label">{{ set.label }}</span>&ngsp;
                <span class="set-value">
                  @switch (set.status) {
                    @case ('completed') {
                      <ion-icon name="checkmark-circle" aria-hidden="true" />
                    }
                    @case ('skipped') {
                      <ion-icon name="remove-circle-outline" aria-hidden="true" />
                    }
                    @default {
                      <ion-icon name="ellipse-outline" aria-hidden="true" />
                    }
                  }
                  <span>{{ set.value }}</span>
                </span>
              </li>
            }
          </ol>
        </li>
      }
    </ol>
  `,
  styleUrl: './history-exercise-list.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryExerciseListComponent {
  readonly exercises = input.required<readonly HistoryExerciseView[]>();

  protected readonly copy = WORKOUT_COPY.history;
}
