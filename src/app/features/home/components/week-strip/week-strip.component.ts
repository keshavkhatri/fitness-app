import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { HomeWeekView } from '../../home-training';

/**
 * This week at a glance: done, planned and rest days, and today. One button
 * (one tab stop, one spoken sentence); the drawn days are decorative.
 * Content is phrasing-only (<span>s) as a <button> requires.
 */
@Component({
  selector: 'app-week-strip',
  template: `
    @let w = week();
    <button type="button" class="strip" [attr.aria-label]="w.accessibleLabel" data-testid="home-week" (click)="openPlan.emit()">
      <span class="top" aria-hidden="true">
        <span class="eyebrow">This week</span>
        <span class="count" data-testid="home-week-count">
          <span class="count-text">{{ w.countLabel }}</span>
          <span class="segments">
            @for (i of segments(); track $index) {
              <span class="segment" [class.on]="i"></span>
            }
          </span>
        </span>
      </span>
      <span class="days" aria-hidden="true">
        @for (d of w.days; track d.key) {
          <span class="day" [attr.data-state]="d.state" [class.today]="d.isToday">
            <span class="letter">{{ d.letter }}</span>
            <span class="dot">
              @if (d.state === 'done') {
                <ion-icon name="checkmark" />
              } @else {
                {{ d.date }}
              }
            </span>
          </span>
        }
      </span>
    </button>
  `,
  styleUrl: './week-strip.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeekStripComponent {
  readonly week = input.required<HomeWeekView>();
  /** The Workout tab (the weekly plan). */
  readonly openPlan = output<void>();

  /** One segment per planned workout (or per finished one, if more were done), filled up to the count. */
  protected segments(): boolean[] {
    const { done, planned } = this.week();
    return Array.from({ length: Math.max(planned, done) }, (_, i) => i < done);
  }
}
