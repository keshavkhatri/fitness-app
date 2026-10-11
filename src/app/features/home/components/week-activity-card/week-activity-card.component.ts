import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent } from '../../../../shared/ui';
import { HomeWeekView } from '../../home-training';

/** Bars never shrink below this share, so a short workout still reads as done. */
const MIN_DONE_HEIGHT = 0.35;
/** A full-height bar is at least an hour (or the week's longest day). */
const FULL_BAR_MINUTES = 60;

/**
 * This week's training: finished of planned workouts and one bar per day
 * (Monday–Sunday). Done bars are as tall as the time trained; planned days
 * show an empty tall bar, rest days a short one. Only recorded history and the
 * plan's own week. The whole card opens Progress. Presentational only.
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

      <!-- One sentence for assistive tech; the bars are its picture. -->
      <div class="chart" role="img" data-testid="home-week" [attr.aria-label]="w.accessibleLabel">
        @for (day of bars(); track day.key) {
          <div class="day" [attr.data-state]="day.state" [class.today]="day.isToday">
            <span class="bar"><span class="fill" [style.height.%]="day.height"></span></span>
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

  protected readonly bars = computed(() => {
    const days = this.week().days;
    const longest = Math.max(FULL_BAR_MINUTES, ...days.map((d) => d.minutes));
    return days.map((d) => ({
      ...d,
      height: d.state === 'done' ? Math.max(MIN_DONE_HEIGHT, d.minutes / longest) * 100 : d.state === 'planned' ? 85 : 40,
    }));
  });
}
