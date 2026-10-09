import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { ExerciseView } from '../workout-view-model';

/**
 * A session's exercises in programmed order. The numbered tile is a neutral
 * placeholder: the catalog has no exercise media yet.
 */
@Component({
  selector: 'app-exercise-list',
  template: `
    <ol class="exercises">
      @for (exercise of exercises(); track exercise.order) {
        <li class="exercise" data-testid="exercise">
          <span class="thumb" aria-hidden="true">{{ exercise.order }}</span>
          <div class="body">
            <h3 class="name">{{ exercise.name }}</h3>
            <p class="prescription" data-testid="prescription">
              @for (part of exercise.prescriptionParts; track $index; let first = $first) {
                @if (!first) {
                  <span class="separator" aria-hidden="true"> · </span>
                }
                <span class="part">{{ part }}</span>
              }
            </p>
            @if (exercise.focus; as focus) {
              <p class="focus">{{ focus }}</p>
            }
            @if (exercise.note; as note) {
              <p class="note"><ion-icon name="swap-horizontal-outline" aria-hidden="true" />{{ note }}</p>
            }
          </div>
        </li>
      }
    </ol>
  `,
  styleUrl: './exercise-list.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExerciseListComponent {
  readonly exercises = input.required<readonly ExerciseView[]>();
}
