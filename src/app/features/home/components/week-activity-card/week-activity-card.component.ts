import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent } from '../../../../shared/ui';
import { HomeWeekView } from '../../home-training';

/** How a day reads at a glance; every state has its own shape, never colour alone. */
export type WeekDayMark = 'done' | 'planned' | 'missed' | 'rest';

/**
 * This week's training: finished of planned workouts, and one marker per day (Monday–Sunday) with a legend:
 * a filled check for a day trained (with its minutes), a ring for a planned workout still ahead, a dashed ring
 * for a planned day that has passed without one, and a dot for a rest day. Only recorded history and the plan's
 * own week. The whole card opens Progress (its Workout section). Presentational only.
 */
@Component({
  selector: 'app-week-activity-card',
  template: `
    @let w = week();
    <fit-card>
      <div class="head">
        <h2 class="title" [id]="headingId()">
          <!-- Stretched over the card: the whole card opens Progress. -->
          <button type="button" class="title-link" data-testid="home-week-open" (click)="openProgress.emit()">
            <ion-icon name="stats-chart" aria-hidden="true" />This week
          </button>
        </h2>
        <span class="chevron" aria-hidden="true"><ion-icon name="chevron-forward" /></span>
      </div>

      <div class="summary" aria-hidden="true">
        <p class="count" data-testid="home-week-count">{{ w.done }}/{{ w.planned }}</p>
        <p class="unit">{{ w.planned === 1 ? 'workout' : 'workouts' }}</p>
      </div>

      <!-- One sentence for assistive tech; the markers are its picture. -->
      <div class="chart" role="img" data-testid="home-week" [attr.aria-label]="w.accessibleLabel">
        @for (day of marks(); track day.key) {
          <div class="day" [attr.data-state]="day.state" [attr.data-mark]="day.mark" [class.today]="day.isToday" [style.--i]="$index">
            <span class="mark">
              @if (day.mark === 'done') {
                <ion-icon name="checkmark" />
              }
            </span>
            <span class="letter">{{ day.letter }}</span>
            <span class="minutes" data-testid="home-week-minutes">{{ day.mark === 'done' && day.minutes > 0 ? day.minutes + 'm' : '' }}</span>
          </div>
        }
      </div>
      <ul class="legend" aria-hidden="true">
        <li data-mark="done"><span class="mark"><ion-icon name="checkmark" /></span>Done</li>
        <li data-mark="planned"><span class="mark"></span>Planned</li>
        @if (hasMissed()) {
          <li data-mark="missed"><span class="mark"></span>Missed</li>
        }
        <li data-mark="rest"><span class="mark"></span>Rest</li>
      </ul>
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

  /** Each day with its marker: a planned day before today that wasn't trained is "missed". */
  protected readonly marks = computed(() => {
    const days = this.week().days;
    const today = days.findIndex((d) => d.isToday);
    return days.map((d, i) => ({ ...d, mark: (d.state === 'planned' && today >= 0 && i < today ? 'missed' : d.state) as WeekDayMark }));
  });
  protected readonly hasMissed = computed(() => this.marks().some((d) => d.mark === 'missed'));
}
