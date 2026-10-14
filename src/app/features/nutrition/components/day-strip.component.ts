import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { IsoCalendarDate } from '../../../domain/fitness-profile';
import { StripDayView } from '../nutrition-view-model';

/**
 * Monday–Sunday of the shown day's week. The selected day is filled lime;
 * today is outlined when another day is selected. Days after today can't be
 * chosen (nothing can be logged yet).
 */
@Component({
  selector: 'app-nutrition-day-strip',
  template: `
    <ol class="strip" [attr.aria-label]="label()">
      @for (day of days(); track day.date) {
        <li>
          <button
            type="button"
            class="day"
            [class.selected]="day.selected"
            [class.today]="day.isToday"
            [disabled]="day.disabled"
            [attr.aria-label]="day.ariaLabel"
            [attr.aria-current]="day.selected ? 'date' : null"
            [attr.data-testid]="'strip-' + day.date"
            (click)="selectDay.emit(day.date)"
          >
            <span class="weekday" aria-hidden="true">{{ day.weekday }}</span>&ngsp;
            <span class="date" aria-hidden="true">{{ day.day }}</span>
          </button>
        </li>
      }
    </ol>
  `,
  styleUrl: './day-strip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayStripComponent {
  readonly days = input.required<readonly StripDayView[]>();
  readonly label = input.required<string>();
  readonly selectDay = output<IsoCalendarDate>();
}
