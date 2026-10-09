import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, FitnessMetricComponent } from '../../../../shared/ui';
import { HomeProgressView } from '../../home-training';

/** Workouts this week and the latest finished workout, from workout history. Presentational only. */
@Component({
  selector: 'app-progress-summary-card',
  template: `
    @let p = progress();
    <fit-card>
      @if (p.kind === 'ready') {
        <fit-metric label="Workouts this week" [value]="p.thisWeek.count" [unit]="p.thisWeek.unit" size="lg" data-testid="home-week-count" />

        @let last = p.lastWorkout;
        <div class="last">
          <p class="last-label" id="home-last-workout">Last workout</p>
          <button
            type="button"
            class="last-item"
            aria-describedby="home-last-workout"
            data-testid="home-last-workout"
            (click)="openWorkout.emit(last.id)"
          >
            <span class="last-text">
              <span class="last-title">{{ last.title }}</span>&ngsp;
              <span class="last-meta">{{ last.meta }} · {{ last.statusLabel }}</span>
            </span>
            <ion-icon name="chevron-forward" aria-hidden="true" />
          </button>
        </div>

        <button fit-button type="button" block variant="outline" class="cta" (click)="openProgress.emit()">View progress</button>
      } @else {
        <fit-empty-state
          icon="trophy-outline"
          title="No completed workouts yet"
          description="Finish your first workout and your progress will appear here."
        />
      }
    </fit-card>
  `,
  styleUrl: './progress-summary-card.component.scss',
  imports: [IonIcon, EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, FitnessMetricComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressSummaryCardComponent {
  /** 'error' is handled by Home (retry), not here. */
  readonly progress = input.required<Exclude<HomeProgressView, { kind: 'error' }>>();
  /** Finished workout id → its history detail. */
  readonly openWorkout = output<string>();
  readonly openProgress = output<void>();
}
