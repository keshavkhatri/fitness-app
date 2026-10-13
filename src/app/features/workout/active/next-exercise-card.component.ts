import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { WorkoutArtComponent } from '../../home/components/workout-art/workout-art.component';
import { WORKOUT_COPY } from '../workout-content';
import { NextExerciseView } from './active-workout-view-model';

/**
 * "Next up": the exercise after this one (thumbnail, name, first muscle), or
 * on the last exercise a reminder that finishing is next. The whole card is
 * one button that does what the footer's next button does (confirming first
 * when sets are left). No exercise photography ships yet, so the thumbnail is
 * the same generated stand-in Home uses, seeded by the exercise.
 */
@Component({
  selector: 'app-next-exercise-card',
  template: `
    @if (next(); as n) {
      <button type="button" class="card" data-testid="next-up" [attr.aria-label]="copy.nextUpLabel(n.name)" (click)="open.emit()">
        <span class="eyebrow">{{ copy.nextUp }}<ion-icon name="chevron-forward" aria-hidden="true" /></span>&ngsp;
        <span class="body">
          <span class="thumb" aria-hidden="true"><app-workout-art [seed]="n.exerciseId" /></span>
          <span class="text">
            <span class="name">{{ n.name }}</span>&ngsp;
            @if (n.muscles[0]; as muscle) {
              <span class="chip">{{ muscle }}</span>
            }
          </span>
        </span>
      </button>
    } @else {
      <button type="button" class="card last" data-testid="next-up" [attr.aria-label]="copy.lastExercise + '. ' + copy.finish" (click)="open.emit()">
        <span class="eyebrow">{{ copy.lastExercise }}<ion-icon name="chevron-forward" aria-hidden="true" /></span>&ngsp;
        <span class="body">
          <span class="thumb flag" aria-hidden="true"><ion-icon name="flag-outline" /></span>
          <span class="text">
            <span class="name">{{ copy.finish }}</span>&ngsp;
            <span class="chip">{{ copy.lastExerciseHint }}</span>
          </span>
        </span>
      </button>
    }
  `,
  styleUrl: './next-exercise-card.component.scss',
  imports: [IonIcon, WorkoutArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NextExerciseCardComponent {
  /** The following exercise; null on the last one. */
  readonly next = input<NextExerciseView | null>(null);
  readonly open = output<void>();

  protected readonly copy = WORKOUT_COPY.active;
}
