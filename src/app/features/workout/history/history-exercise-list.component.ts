import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { WorkoutArtComponent } from '../../home/components/workout-art/workout-art.component';
import { WORKOUT_COPY } from '../workout-content';
import { exercisePhoto } from '../workout-photos';
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
          <h3 class="heading">
            <!-- The whole head row opens the exercise's performance over time. -->
            <button type="button" class="head" data-testid="history-exercise-open" (click)="openExercise.emit(exercise.exerciseId)">
              <span class="thumb" aria-hidden="true"><app-workout-art [seed]="exercise.exerciseId" [photo]="photo(exercise.exerciseId)" /></span>
              <span class="identity">
                <span class="name">{{ exercise.name }}</span>&ngsp;
                <span class="count">{{ exercise.setsLabel }}<span class="visually-hidden">, {{ exercise.progress }}</span></span>
              </span>&ngsp;
              @if (exercise.best; as best) {
                <span class="best" data-testid="history-best">
                  <span class="best-label">{{ copy.detail.max }}<span class="visually-hidden">:</span></span>&ngsp;
                  <span class="best-value">{{ best }}</span>
                </span>
              }
              <ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
              <span class="visually-hidden">. {{ copy.detail.openPerformance }}</span>
            </button>
          </h3>
          @if (exercise.columns; as columns) {
            <!-- Visual column headings; each row also reads as one sentence ("Set 1: 20 kg × 12"). -->
            <div class="set columns" aria-hidden="true">
              <span>{{ copy.detail.setColumn }}</span>
              @for (column of columns; track column) {
                <span>{{ column }}</span>
              }
              <span></span>
            </div>
          }
          <ol class="sets" [class.tabular]="!!exercise.columns" [attr.aria-label]="copy.detail.actualSets(exercise.name)" data-testid="actual-sets">
            @for (set of exercise.sets; track set.key) {
              <li class="set" [attr.data-status]="set.status">
                <span class="set-number" aria-hidden="true">{{ set.setNumber }}</span>
                <span class="visually-hidden">{{ set.label }}: {{ set.value }}</span>
                @if (exercise.columns && set.cells.length === 2) {
                  <span class="set-value" aria-hidden="true">{{ set.cells[0] }}</span>
                  <span class="set-value" aria-hidden="true">{{ set.cells[1] }}</span>
                } @else {
                  <span class="set-value wide" aria-hidden="true">{{ set.value }}</span>
                }
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
  /** An exercise id: its performance over time (Progress). */
  readonly openExercise = output<string>();

  protected readonly copy = WORKOUT_COPY.history;
  protected readonly photo = exercisePhoto;
}
