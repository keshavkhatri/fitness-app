import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { PerformanceSessionRowView } from './exercise-performance-view-model';

/** An exercise's sessions, newest first: date, sets as completed, the charted value; each opens its workout. */
@Component({
  selector: 'app-performance-session-list',
  template: `
    <ol class="session-list">
      @for (row of rows(); track row.key; let i = $index) {
        <li>
          <button type="button" class="session" [attr.aria-label]="row.accessibleLabel" data-testid="performance-session" (click)="openWorkout.emit(row.workoutId)">
            <span class="index" aria-hidden="true">{{ i + 1 }}</span>
            <span class="session-text" aria-hidden="true">
              <span class="session-date">{{ row.dateLabel }}</span>
              <span class="session-detail">{{ row.detail }}</span>
            </span>
            @if (row.value; as value) {
              <span class="session-value" aria-hidden="true">{{ value }}</span>
            }
            <ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
          </button>
        </li>
      }
    </ol>
  `,
  styleUrl: './performance-session-list.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerformanceSessionListComponent {
  readonly rows = input.required<readonly PerformanceSessionRowView[]>();
  /** The workout log id: its history detail. */
  readonly openWorkout = output<string>();
}
