import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessButtonComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';

/**
 * The workout's persistent controls: the time since it started, the main
 * action and the way on. With sets left it is "Complete set" (the current
 * set, with what is typed) beside "Next Exercise" / "Finish Workout"; with
 * none left, that next step becomes the one big action. Presentational: the
 * page decides what each action does (and confirms first where it must).
 */
@Component({
  selector: 'app-active-footer',
  template: `
    <div class="footer">
      <div class="clock" data-testid="workout-time">
        <span class="clock-label">{{ copy.workoutTime }}</span>
        <span class="clock-value" aria-hidden="true"><ion-icon name="time-outline" />{{ time() }}</span>
        <span class="visually-hidden">{{ copy.workoutTime }}: {{ spokenTime() }}</span>
      </div>
      @if (pending() > 0) {
        <button fit-button type="button" size="lg" icon="checkmark" class="main" data-testid="complete-set" (click)="completeSet.emit()">
          {{ copy.completeSetShort }}
        </button>
        <button fit-button type="button" size="lg" variant="outline" class="side" data-testid="advance" (click)="advance.emit()">
          {{ isLast() ? copy.finish : copy.next }}
        </button>
      } @else {
        <button
          fit-button
          type="button"
          size="lg"
          [icon]="isLast() ? 'checkmark' : undefined"
          class="main wide"
          data-testid="advance"
          (click)="advance.emit()"
        >
          {{ isLast() ? copy.finish : copy.next }}
        </button>
      }
    </div>
  `,
  styleUrl: './active-footer.component.scss',
  imports: [IonIcon, FitnessButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActiveFooterComponent {
  /** "8:24" */
  readonly time = input.required<string>();
  /** "8 minutes 24 seconds" */
  readonly spokenTime = input.required<string>();
  /** Sets still to do on this exercise. */
  readonly pending = input.required<number>();
  readonly isLast = input.required<boolean>();

  readonly completeSet = output<void>();
  /** Next exercise, or (on the last) finishing. */
  readonly advance = output<void>();

  protected readonly copy = WORKOUT_COPY.active;
}
