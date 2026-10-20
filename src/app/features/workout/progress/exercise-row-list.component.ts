import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { WorkoutArtComponent } from '../../home/components/workout-art/workout-art.component';
import { ExerciseRowView } from './exercise-list-view-model';
import { exercisePhoto } from '../workout-photos';

/**
 * Performed exercises as compact rows: thumbnail, name and body area, a mini
 * trend of the top set over recent sessions (heights relative to the largest;
 * the change is also in text), and the latest top set. Each row is one
 * button to the exercise's performance.
 */
@Component({
  selector: 'app-exercise-row-list',
  template: `
    <ol class="rows">
      @for (row of rows(); track row.exerciseId) {
        <li>
          <button type="button" class="row" [attr.aria-label]="row.accessibleLabel" data-testid="exercise-row" (click)="openExercise.emit(row.exerciseId)">
            <span class="thumb" aria-hidden="true"><app-workout-art [seed]="row.exerciseId" [photo]="photo(row.exerciseId)" /></span>
            <span class="text" aria-hidden="true">
              <span class="name">{{ row.name }}</span>
              <span class="area">{{ row.area ?? row.lastLabel }}</span>
            </span>
            <span class="trend" aria-hidden="true">
              @if (row.trend; as t) {
                <span class="bars">
                  @for (h of t.bars; track $index) {
                    <span class="bar" [style.height.%]="20 + h * 80"></span>
                  }
                </span>
              }
            </span>
            <span class="figure" aria-hidden="true">
              @if (row.trend; as t) {
                <span class="change" [attr.data-direction]="t.direction">
                  @if (t.direction !== 'same') {
                    <ion-icon [name]="t.direction === 'up' ? 'arrow-up' : 'arrow-down'" />
                  }
                  {{ t.change }}
                </span>
                <span class="caption">{{ t.since }}</span>
              } @else {
                <span class="latest">{{ row.latest }}</span>
                <span class="caption">{{ row.lastLabel }}</span>
              }
            </span>
            <ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
          </button>
        </li>
      }
    </ol>
  `,
  styleUrl: './exercise-row-list.component.scss',
  imports: [IonIcon, WorkoutArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExerciseRowListComponent {
  protected readonly photo = exercisePhoto;
  readonly rows = input.required<readonly ExerciseRowView[]>();
  readonly openExercise = output<string>();
}
