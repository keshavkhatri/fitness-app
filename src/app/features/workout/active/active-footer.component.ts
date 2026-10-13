import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { WORKOUT_COPY } from '../workout-content';

/**
 * The workout's persistent controls: the time since it started, the main
 * action and the way on. With sets left it is "Complete set" (the current
 * set, with what is typed) beside "Next exercise" / "Finish workout"; with
 * none left, that next step becomes the one big action. Presentational: the
 * page decides what each action does (and confirms first where it must).
 */
@Component({
  selector: 'app-active-footer',
  template: `
    <div class="footer">
      <div class="clock" data-testid="workout-time">
        <span class="clock-label" aria-hidden="true"><ion-icon name="timer-outline" />{{ copy.workoutTime }}</span>
        <span class="clock-value" aria-hidden="true"><ion-icon name="time-outline" />{{ time() }}</span>
        <span class="visually-hidden">{{ copy.workoutTime }}: {{ spokenTime() }}</span>
      </div>
      @if (pending() > 0) {
        <button type="button" class="main" data-testid="complete-set" (click)="completeSet.emit()">
          <span class="tick" aria-hidden="true"><ion-icon name="checkmark" /></span>{{ copy.completeSetShort }}
        </button>
        <button type="button" class="side" data-testid="advance" (click)="advance.emit()">
          <span class="side-label">{{ isLast() ? copy.finishShort : copy.nextShort }}</span><ion-icon name="chevron-forward" aria-hidden="true" />
        </button>
      } @else {
        <button type="button" class="main wide" data-testid="advance" (click)="advance.emit()">
          @if (isLast()) {
            <span class="tick" aria-hidden="true"><ion-icon name="checkmark" /></span>
          }
          {{ isLast() ? copy.finishShort : copy.nextShort }}
          @if (!isLast()) {
            <ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
          }
        </button>
      }
    </div>
  `,
  styleUrl: './active-footer.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActiveFooterComponent {
  /** "08:24" */
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
