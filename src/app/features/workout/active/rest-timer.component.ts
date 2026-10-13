import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessProgressComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { RestTimerStatus, formatClock } from './rest-timer';

/**
 * The rest card: a ring that drains as the rest counts down, with pause or
 * resume in its centre, plus restart and skip. Before any rest it shows the
 * programmed rest with a start button, so rest can also be started by hand.
 * Never blocks the screen: the next set can be logged at any time. The
 * countdown itself isn't announced every second; the page announces completion.
 */
@Component({
  selector: 'app-rest-timer',
  template: `
    <section class="rest" [attr.data-status]="status()" aria-labelledby="rest-title" [attr.data-testid]="status() === 'idle' ? 'rest-idle' : 'rest-timer'">
      <fit-progress
        class="ring"
        variant="ring"
        [ringSize]="124"
        [thickness]="4.5"
        [gradient]="status() !== 'done'"
        [tone]="status() === 'done' ? 'success' : 'primary'"
        [value]="ringValue()"
        [max]="total()"
        [label]="copy.title"
        [valueText]="status() === 'idle' ? copy.planned(clock()) : copy.remaining(clock())"
      >
        <div class="center">
          <h2 class="title" id="rest-title">{{ status() === 'done' ? copy.completeTitle : copy.title }}</h2>
          <p class="time" data-testid="rest-time">
            <span aria-hidden="true">{{ clock() }}</span>
            <span class="visually-hidden">{{ status() === 'idle' ? copy.planned(clock()) : copy.remaining(clock()) }}</span>
          </p>
          @switch (status()) {
            @case ('idle') {
              <button type="button" class="round" [attr.aria-label]="copy.start" data-testid="rest-start" (click)="startRest.emit()">
                <ion-icon name="play" aria-hidden="true" />
              </button>
            }
            @case ('running') {
              <button type="button" class="round" [attr.aria-label]="copy.pause" (click)="pauseRest.emit()">
                <ion-icon name="pause" aria-hidden="true" />
              </button>
            }
            @case ('paused') {
              <button type="button" class="round" [attr.aria-label]="copy.resume" (click)="resumeRest.emit()">
                <ion-icon name="play" aria-hidden="true" />
              </button>
            }
            @default {
              <button type="button" class="round" [attr.aria-label]="copy.dismiss" (click)="skipRest.emit()">
                <ion-icon name="checkmark" aria-hidden="true" />
              </button>
            }
          }
        </div>
      </fit-progress>
      @if (status() === 'running' || status() === 'paused') {
        <div class="actions">
          <button type="button" class="text" [attr.aria-label]="copy.restart" (click)="restartRest.emit()">{{ copy.restart }}</button>
          <button type="button" class="text" [attr.aria-label]="copy.skip" (click)="skipRest.emit()">{{ copy.skipShort }}</button>
        </div>
      }
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
  readonly restartRest = output<void>();
  readonly skipRest = output<void>();

  protected readonly copy = WORKOUT_COPY.active.rest;
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
