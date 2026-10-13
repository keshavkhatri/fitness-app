import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { WorkoutArtComponent } from '../../home/components/workout-art/workout-art.component';
import { PlanWeekRowView } from './plan-view-model';

/**
 * The week's training sessions as compact rows: thumbnail, name, length,
 * date and status (by icon and text). Each row is one button to Workout Detail.
 */
@Component({
  selector: 'app-plan-week-list',
  template: `
    <ol class="rows">
      @for (row of rows(); track row.sessionId) {
        <li>
          <button
            type="button"
            class="row"
            [class.today]="row.isToday"
            [attr.data-status]="row.status"
            [attr.aria-label]="row.accessibleLabel"
            data-testid="plan-week-row"
            (click)="openSession.emit(row.sessionId)"
          >
            <span class="thumb" aria-hidden="true"><app-workout-art [seed]="row.sessionId" /></span>
            <span class="text" aria-hidden="true">
              <span class="title">{{ row.title }}</span>
              <span class="meta">{{ row.meta }}</span>
            </span>
            <span class="side" aria-hidden="true">
              <span class="date">{{ row.dateLabel }}</span>
              <span class="status" [attr.title]="row.statusLabel">
                @switch (row.status) {
                  @case ('done') {
                    <ion-icon name="checkmark" />
                  }
                  @case ('in-progress') {
                    <ion-icon name="play" />
                  }
                }
              </span>
            </span>
          </button>
        </li>
      }
    </ol>
  `,
  styleUrl: './plan-week-list.component.scss',
  imports: [IonIcon, WorkoutArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanWeekListComponent {
  readonly rows = input.required<readonly PlanWeekRowView[]>();
  readonly openSession = output<string>();
}
