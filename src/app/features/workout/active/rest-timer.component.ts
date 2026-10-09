import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { FitnessButtonComponent, FitnessProgressComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { RestTimerStatus, formatClock } from './rest-timer';

/**
 * Rest countdown with pause/resume, restart and skip. Never blocks the
 * screen: it sits above the navigation and can be skipped at any time.
 * The countdown itself is not announced every second; completion is
 * announced by the page.
 */
@Component({
  selector: 'app-rest-timer',
  template: `
    <section class="rest" [attr.data-status]="status()" aria-labelledby="rest-title" data-testid="rest-timer">
      <div class="info">
        <h2 class="title" id="rest-title">{{ status() === 'done' ? copy.completeTitle : copy.title }}</h2>
        <p class="time" data-testid="rest-time">
          <span aria-hidden="true">{{ clock() }}</span>
          <span class="visually-hidden">{{ copy.remaining(clock()) }}</span>
        </p>
      </div>
      <fit-progress [value]="elapsed()" [max]="total()" [label]="copy.title" [valueText]="copy.remaining(clock())" />
      <div class="actions">
        @if (status() === 'done') {
          <button fit-button type="button" variant="secondary" block (click)="skipRest.emit()">{{ copy.dismiss }}</button>
        } @else {
          @if (status() === 'paused') {
            <button fit-button type="button" variant="outline" (click)="resumeRest.emit()">{{ copy.resume }}</button>
          } @else {
            <button fit-button type="button" variant="outline" (click)="pauseRest.emit()">{{ copy.pause }}</button>
          }
          <button fit-button type="button" variant="outline" (click)="restartRest.emit()">{{ copy.restart }}</button>
          <button fit-button type="button" variant="secondary" (click)="skipRest.emit()">{{ copy.skip }}</button>
        }
      </div>
    </section>
  `,
  styleUrl: './rest-timer.component.scss',
  imports: [FitnessButtonComponent, FitnessProgressComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestTimerComponent {
  readonly status = input.required<RestTimerStatus>();
  readonly remaining = input.required<number>();
  readonly total = input.required<number>();

  readonly pauseRest = output<void>();
  readonly resumeRest = output<void>();
  readonly restartRest = output<void>();
  readonly skipRest = output<void>();

  protected readonly copy = WORKOUT_COPY.active.rest;
  protected readonly clock = computed(() => formatClock(this.remaining()));
  protected readonly elapsed = computed(() => this.total() - this.remaining());
}
