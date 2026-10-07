import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { FitnessCardComponent, FitnessMetricComponent, FitnessProgressComponent } from '../../../../shared/ui';
import { ProgressSummary } from '../../home.models';

@Component({
  selector: 'app-progress-summary-card',
  template: `
    @let p = progress();
    <fit-card>
      <div class="week">
        <fit-metric
          label="Workouts this week"
          [value]="p.workoutsCompletedThisWeek"
          [unit]="'of ' + p.workoutsPlannedThisWeek"
          size="lg"
        />
        <fit-progress
          class="week-bar"
          label="Workouts completed this week"
          tone="success"
          [value]="p.workoutsCompletedThisWeek"
          [max]="p.workoutsPlannedThisWeek"
          [valueText]="p.workoutsCompletedThisWeek + ' of ' + p.workoutsPlannedThisWeek + ' workouts'"
        />
      </div>

      <ul class="metrics">
        @for (metric of p.metrics; track metric.id) {
          <li>
            <fit-metric [label]="metric.label" [value]="metric.value" [unit]="metric.unit" [trend]="metric.trend" />
          </li>
        }
      </ul>
    </fit-card>
  `,
  styleUrl: './progress-summary-card.component.scss',
  imports: [FitnessCardComponent, FitnessMetricComponent, FitnessProgressComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressSummaryCardComponent {
  readonly progress = input.required<ProgressSummary>();
}
