import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { IonIcon } from '@ionic/angular';

import { WorkoutArtComponent } from '../../../home/components/workout-art/workout-art.component';
import { WORKOUT_COPY } from '../../workout-content';
import { exercisePhoto } from '../../workout-photos';
import { SummaryExerciseView } from '../workout-summary-view-model';

const STATUS_ICONS: Readonly<Record<string, string>> = { complete: 'checkmark', partial: 'remove', skipped: 'close' };

/** Exercise breakdown (light): each exercise as performed, in the order it was done. */
@Component({
  selector: 'app-summary-breakdown',
  template: `
    <header class="header">
      <h1 class="title" tabindex="-1" data-view-heading>{{ copy.title }}</h1>
      <p class="lead">{{ copy.intro }}</p>
    </header>

    @if (exercises().length) {
      <ol class="exercises" data-testid="summary-exercises">
        @for (exercise of exercises(); track exercise.key) {
          <li>
            @if (exercise.canOpen) {
              <button type="button" class="exercise" [attr.data-status]="exercise.status" (click)="open.emit(exercise.exerciseId)">
                <ng-container *ngTemplateOutlet="row; context: { $implicit: exercise }" />
                <ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
                <span class="visually-hidden">. {{ copy.open }}</span>
              </button>
            } @else {
              <div class="exercise" [attr.data-status]="exercise.status">
                <ng-container *ngTemplateOutlet="row; context: { $implicit: exercise }" />
              </div>
            }
          </li>
        }
      </ol>

      <aside class="done" data-testid="summary-exercises-done">
        <span class="done-icon" aria-hidden="true"><ion-icon name="list-outline" /></span>
        <p>{{ doneText() }}</p>
      </aside>
    } @else {
      <p class="empty" data-testid="summary-no-exercises">{{ copy.none }}</p>
    }

    <ng-template #row let-exercise>
      <span class="thumb" aria-hidden="true"><app-workout-art [seed]="exercise.exerciseId" [photo]="photo(exercise.exerciseId)" /></span>
      <span class="text">
        <span class="name">{{ exercise.name }}</span>&ngsp;
        <span class="detail">
          {{ exercise.setsLabel }}
          @if (exercise.performed) {
            <span aria-hidden="true"> · </span><span class="visually-hidden">: </span>{{ exercise.performed }}
          }
        </span>&ngsp;
        @if (exercise.load || exercise.volume) {
          <span class="detail">
            {{ exercise.load }}
            @if (exercise.load && exercise.volume) {
              <span aria-hidden="true"> · </span><span class="visually-hidden">, </span>
            }
            {{ exercise.volume }}
          </span>&ngsp;
        }
      </span>
      <span class="status" [attr.data-status]="exercise.status">
        <ion-icon [name]="icons[exercise.status]" aria-hidden="true" />
        <span class="visually-hidden">{{ exercise.statusLabel }}</span>
      </span>
    </ng-template>
  `,
  styleUrl: './breakdown-view.component.scss',
  imports: [IonIcon, WorkoutArtComponent, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SummaryBreakdownComponent {
  readonly exercises = input.required<readonly SummaryExerciseView[]>();
  readonly open = output<string>();

  protected readonly copy = WORKOUT_COPY.summary.breakdown;
  protected readonly photo = exercisePhoto;
  protected readonly icons = STATUS_ICONS;
  protected readonly doneText = computed(() => {
    const all = this.exercises();
    const done = all.filter((e) => e.status === 'complete').length;
    return done === all.length ? this.copy.allDone(all.length) : this.copy.someDone(done, all.length);
  });
}
