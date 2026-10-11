import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent } from '../../../../shared/ui';
import { HomeWeekView } from '../../home-training';

/**
 * This week's training at a glance: finished of planned workouts and one bar
 * per day (Monday–Sunday). Done = a training workout was finished that day;
 * planned = the plan schedules one; rest = neither. Only recorded history and
 * the plan's own week, nothing projected. Presentational only.
 */
@Component({
  selector: 'app-week-activity-card',
  template: `
    @let w = week();
    <fit-card padding="none">
      <h2 class="title" [id]="headingId()">
        <button type="button" class="title-link" (click)="openProgress.emit()">
          <ion-icon name="calendar-outline" aria-hidden="true" />This week<ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
        </button>
      </h2>

      <div class="summary" aria-hidden="true">
        <p class="count" data-testid="home-week-count">{{ w.done }}<span class="of">/{{ w.planned }}</span></p>
        <p class="unit">{{ w.planned === 1 ? 'workout' : 'workouts' }}</p>
      </div>

      <!-- One sentence for assistive tech; the bars are its picture. -->
      <div class="chart" role="img" data-testid="home-week" [attr.aria-label]="w.accessibleLabel">
        @for (day of w.days; track day.key) {
          <div class="day" [attr.data-state]="day.state" [class.today]="day.isToday">
            <span class="bar"></span>
            <span class="letter">{{ day.letter }}</span>
          </div>
        }
      </div>
    </fit-card>
  `,
  styleUrl: './week-activity-card.component.scss',
  imports: [IonIcon, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeekActivityCardComponent {
  readonly week = input.required<HomeWeekView>();
  readonly headingId = input('home-week-heading');
  /** Progress (weekly activity and per-exercise history). */
  readonly openProgress = output<void>();
}
