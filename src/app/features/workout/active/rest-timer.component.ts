import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessProgressComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { RestTimerStatus, formatClock } from './rest-timer';

/**
 * The rest card: a ring that drains as the rest counts down, with one control
 * in its centre (start, pause, resume, or dismiss when done). Restart and skip
 * live in the workout's options menu. Before any rest it shows the programmed
 * rest, so rest can also be started by hand. Never blocks: the next set can be
 * logged at any time. The countdown isn't announced every second; the page
 * announces completion.
 */
@Component({
  selector: 'app-rest-timer',
  template: `
    <section class="rest" [attr.data-status]="status()" aria-labelledby="rest-title" [attr.data-testid]="status() === 'idle' ? 'rest-idle' : 'rest-timer'">
      <fit-progress
        class="ring"
        variant="ring"
        [ringSize]="128"
        [thickness]="2.2"
        [gradient]="status() !== 'done'"
        [tone]="status() === 'done' ? 'success' : 'primary'"
        [value]="ringValue()"
        [max]="total() || 1"
        [label]="copy.title"
        [valueText]="status() === 'idle' ? copy.planned(clock()) : copy.remaining(clock())"
      >
        <div class="center">
          <h2 class="title" id="rest-title">{{ status() === 'done' ? copy.doneTitle : copy.title }}</h2>
          <p class="time" data-testid="rest-time">
            <span aria-hidden="true">{{ clock() }}</span>
            <span class="visually-hidden">{{ status() === 'idle' ? copy.planned(clock()) : copy.remaining(clock()) }}</span>
          </p>
          @switch (status()) {
            @case ('idle') {
              <button type="button" class="round" [attr.aria-label]="copy.start" data-testid="rest-start" (click)="startRest.emit()">
                <span class="face" aria-hidden="true"><ion-icon name="play" /></span>
              </button>
            }
            @case ('running') {
              <button type="button" class="round" [attr.aria-label]="copy.pause" (click)="pauseRest.emit()">
                <span class="face" aria-hidden="true"><ion-icon name="pause" /></span>
              </button>
            }
            @case ('paused') {
              <button type="button" class="round" [attr.aria-label]="copy.resume" (click)="resumeRest.emit()">
                <span class="face" aria-hidden="true"><ion-icon name="play" /></span>
              </button>
            }
            @default {
              <button type="button" class="round" [attr.aria-label]="copy.dismiss" (click)="dismissRest.emit()">
                <span class="face" aria-hidden="true"><ion-icon name="checkmark" /></span>
              </button>
            }
          }
        </div>
      </fit-progress>
      <button type="button" class="edit" data-testid="rest-edit" [attr.aria-label]="copy.edit(plannedClock())" (click)="editRest.emit()">
        <span class="edit-face" aria-hidden="true"><ion-icon name="create-outline" /></span>
      </button>
    </section>
  `,
  styleUrl: './rest-timer.component.scss',
  imports: [IonIcon, FitnessProgressComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestTimerComponent {
  readonly status = input.required<RestTimerStatus>();
  readonly remaining = input.required<number>();
  readonly total = input.required<number>();
  /** The exercise's programmed rest, shown (with a start button) while idle. */
  readonly plannedSeconds = input(0);

  readonly startRest = output<void>();
  readonly pauseRest = output<void>();
  readonly resumeRest = output<void>();
  readonly dismissRest = output<void>();
  /** Asks to change how long rest lasts. */
  readonly editRest = output<void>();

  protected readonly copy = WORKOUT_COPY.active.rest;
  /** The rest length in force (what the next rest will run), for the edit button's name. */
  protected readonly plannedClock = computed(() => formatClock(this.plannedSeconds()));
  protected readonly clock = computed(() => formatClock(this.status() === 'idle' ? this.plannedSeconds() : this.remaining()));
  /** The ring drains as the rest runs; a finished rest is a full ring; before a rest it is empty. */
  protected readonly ringValue = computed(() => {
    switch (this.status()) {
      case 'running':
      case 'paused':
        return this.remaining();
      case 'done':
        return this.total();
      default:
        return 0;
    }
  });
}
