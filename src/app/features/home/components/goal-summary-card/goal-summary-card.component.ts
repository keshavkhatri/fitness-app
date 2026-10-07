import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { FitnessCardComponent, FitnessChipComponent, FitnessProgressComponent } from '../../../../shared/ui';
import { GoalSummary } from '../../home.models';

@Component({
  selector: 'app-goal-summary-card',
  template: `
    <fit-card>
      <div class="header">
        <h3 class="title">{{ goal().title }}</h3>
        <fit-chip tone="primary">{{ weekLabel() }}</fit-chip>
      </div>
      <p class="description">{{ goal().description }}</p>
      <fit-progress
        label="Goal progress"
        [value]="goal().currentWeek"
        [max]="goal().totalWeeks"
        [valueText]="weekLabel()"
      />
    </fit-card>
  `,
  styleUrl: './goal-summary-card.component.scss',
  imports: [FitnessCardComponent, FitnessChipComponent, FitnessProgressComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoalSummaryCardComponent {
  readonly goal = input.required<GoalSummary>();

  protected readonly weekLabel = computed(() => `Week ${this.goal().currentWeek} of ${this.goal().totalWeeks}`);
}
