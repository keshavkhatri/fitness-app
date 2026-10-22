import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

import { ActivityGrid, ActivityGridDay, ActivityKind } from '../../../domain/daily-check-in';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const WEEKDAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'] as const;

/**
 * Active days as a commit-graph style grid: one column per week (Monday at the top), darker for more kinds of
 * things recorded that day. Fits a phone's width (no sideways scrolling). A tap on a day says what was recorded.
 */
@Component({
  selector: 'app-streak-grid',
  template: `
    @let g = grid();
    <div class="grid-wrap">
      <div class="weekdays" aria-hidden="true">
        <span></span>
        @for (label of weekdays; track $index) {
          <span>{{ label }}</span>
        }
      </div>
      <div class="grid-area">
        <div class="months" aria-hidden="true" [style.--weeks]="g.weeks.length">
          @for (m of g.months; track m.week) {
            <span [style.grid-column]="m.week + 1">{{ m.label }}</span>
          }
        </div>
        <div class="grid" role="grid" aria-label="Active days, week by week" data-testid="streak-grid" [style.--weeks]="g.weeks.length">
          @for (week of g.weeks; track week.key) {
            <div class="week" role="row" [style.--i]="$index">
              @for (day of week.days; track day.date) {
                <button
                  type="button"
                  role="gridcell"
                  class="cell"
                  [attr.data-level]="day.future ? null : day.level"
                  [class.future]="day.future"
                  [class.today]="day.today"
                  [class.selected]="day.date === selected()?.date"
                  [disabled]="day.future"
                  [attr.aria-label]="dayLabel(day)"
                  (click)="selected.set(day)"
                ></button>
              }
            </div>
          }
        </div>
      </div>
    </div>
    <div class="grid-foot">
      <p class="day-detail" aria-live="polite" data-testid="streak-day">{{ selected() ? dayLabel(selected()!) : 'Tap a day to see what you recorded.' }}</p>
      <span class="legend" aria-hidden="true">
        Less<span class="cell" data-level="0"></span><span class="cell" data-level="1"></span><span class="cell" data-level="2"></span><span class="cell" data-level="3"></span><span class="cell" data-level="4"></span>More
      </span>
    </div>
  `,
  styleUrl: './streak-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StreakGridComponent {
  readonly grid = input.required<ActivityGrid>();
  readonly kindLabels = input.required<Readonly<Record<ActivityKind, string>>>();

  protected readonly weekdays = WEEKDAY_LABELS;
  protected readonly selected = signal<ActivityGridDay | null>(null);

  /** "Thu 1 Oct: Workout, Food" / "Today: nothing recorded". */
  protected dayLabel(day: ActivityGridDay): string {
    const [y, m, dd] = day.date.split('-').map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    const what = day.kinds.length ? day.kinds.map((k) => this.kindLabels()[k]).join(', ') : 'nothing recorded';
    return `${day.today ? 'Today' : `${weekday} ${dd} ${MONTHS[m - 1]}`}: ${what}`;
  }
}
