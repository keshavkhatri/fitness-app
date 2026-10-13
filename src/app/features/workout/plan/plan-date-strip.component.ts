import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { PlanStripDayView } from './plan-view-model';

/**
 * Monday–Sunday with dates. Today is filled lime; a dot marks planned
 * training, a check a day with a finished workout. Days with a session open
 * Workout Detail; rest days aren't buttons. Each day has a full spoken label.
 */
@Component({
  selector: 'app-plan-date-strip',
  template: `
    <ol class="strip" [attr.aria-label]="label()">
      @for (day of days(); track day.key) {
        <li>
          @if (day.sessionId) {
            <button
              type="button"
              class="day"
              [class.today]="day.isToday"
              [attr.data-state]="day.state"
              [attr.aria-label]="day.accessibleLabel"
              [attr.aria-current]="day.isToday ? 'date' : null"
              data-testid="strip-day"
              (click)="selectDay.emit(day.sessionId)"
            >
              <ng-container *ngTemplateOutlet="face; context: { $implicit: day }" />
            </button>
          } @else {
            <span
              class="day"
              role="img"
              [class.today]="day.isToday"
              [attr.data-state]="day.state"
              [attr.aria-label]="day.accessibleLabel"
              [attr.aria-current]="day.isToday ? 'date' : null"
              data-testid="strip-day"
            >
              <ng-container *ngTemplateOutlet="face; context: { $implicit: day }" />
            </span>
          }
        </li>
      }
    </ol>

    <ng-template #face let-day>
      <span class="letter" aria-hidden="true">{{ day.letter }}</span>
      <span class="date" aria-hidden="true">{{ day.date }}</span>
      <span class="mark" aria-hidden="true"></span>
    </ng-template>
  `,
  styleUrl: './plan-date-strip.component.scss',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanDateStripComponent {
  readonly days = input.required<readonly PlanStripDayView[]>();
  readonly label = input.required<string>();
  /** A plan session id. */
  readonly selectDay = output<string>();
}
