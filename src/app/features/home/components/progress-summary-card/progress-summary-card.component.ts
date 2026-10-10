import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent } from '../../../../shared/ui';
import { HomeProgressView } from '../../home-training';

/** The latest finished workout, from workout history. Presentational only. */
@Component({
  selector: 'app-progress-summary-card',
  template: `
    @let p = progress();
    <fit-card padding="none">
      @if (p.kind === 'ready') {
        @let last = p.lastWorkout;
        <button type="button" class="row" data-testid="home-last-workout" (click)="openWorkout.emit(last.id)">
          <span class="icon" [attr.data-status]="last.status" aria-hidden="true">
            <ion-icon [name]="last.status === 'complete' ? 'checkmark' : 'ellipse-outline'" />
          </span>
          <span class="text">
            <span class="title">{{ last.title }}</span>&ngsp;
            <span class="meta">{{ last.meta }} · {{ last.statusLabel }}</span>
          </span>
          <ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
        </button>
      } @else {
        <div class="empty">
          <span class="icon" aria-hidden="true"><ion-icon name="trending-up-outline" /></span>
          <span class="text">
            <span class="title">No completed workouts yet</span>
            <span class="meta">Finish your first workout to see it here.</span>
          </span>
        </div>
      }
    </fit-card>
  `,
  styleUrl: './progress-summary-card.component.scss',
  imports: [IonIcon, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressSummaryCardComponent {
  /** 'error' is handled by Home (retry), not here. */
  readonly progress = input.required<Exclude<HomeProgressView, { kind: 'error' }>>();
  /** Finished workout id → its history detail. */
  readonly openWorkout = output<string>();
}
