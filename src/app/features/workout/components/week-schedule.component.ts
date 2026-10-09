import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { WORKOUT_COPY } from '../workout-content';
import { DayView } from '../workout-view-model';

const ICONS = { resistance: 'barbell-outline', activity: 'walk-outline', rest: 'moon-outline' } as const;

/**
 * The week at a glance, Monday first. Training days open their detail;
 * rest days are informational. Day type is shown by icon and text, never by
 * color alone; today is marked with a visible "Today" label and aria-current.
 */
@Component({
  selector: 'app-week-schedule',
  template: `
    <ol class="week">
      @for (day of week(); track day.key) {
        <li [attr.data-kind]="day.session.kind" [class.today]="day.isToday" [attr.aria-current]="day.isToday ? 'date' : null">
          @if (day.session.kind === 'rest') {
            <div class="row" data-testid="week-day">
              <ng-container *ngTemplateOutlet="content; context: { $implicit: day }" />
            </div>
          } @else {
            <button type="button" class="row" data-testid="week-day" (click)="selectDay.emit(day)">
              <ng-container *ngTemplateOutlet="content; context: { $implicit: day }" />
              <ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
            </button>
          }
        </li>
      }
    </ol>

    <ng-template #content let-day>
      <span class="visually-hidden">{{ day.accessibleLabel }}</span>
      <span class="weekday" aria-hidden="true">
        <span class="weekday-name">{{ day.shortWeekday }}</span>
        @if (day.isToday) {
          <span class="today-label">{{ copy.today }}</span>
        }
      </span>
      <span class="marker" aria-hidden="true"><ion-icon [name]="iconFor(day)" /></span>
      <span class="text" aria-hidden="true">
        <span class="title">{{ day.session.kind === 'rest' ? copy.rest : day.session.title }}</span>
        @if (day.session.kind !== 'rest') {
          <span class="summary">{{ day.session.summary }}</span>
        }
      </span>
    </ng-template>
  `,
  styleUrl: './week-schedule.component.scss',
  imports: [IonIcon, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeekScheduleComponent {
  readonly week = input.required<readonly DayView[]>();
  readonly selectDay = output<DayView>();

  protected readonly copy = WORKOUT_COPY.week;
  protected iconFor(day: DayView): string {
    return ICONS[day.session.kind];
  }
}
