import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { FitnessCardComponent } from '../../../shared/ui';
import { GoalViewModel } from '../assessment-view-model';

@Component({
  selector: 'app-goal-summary',
  template: `
    <fit-card>
      <section class="goal" aria-labelledby="assessment-goal">
        <h2 class="eyebrow" id="assessment-goal">Your goal</h2>
        <p class="label" data-testid="goal-label">{{ goal().label }}</p>
        @if (goal().target; as target) {
          <div class="target" data-testid="goal-target">
            <h3 class="eyebrow">Target</h3>
            <p class="summary">{{ target.summary }}</p>
            <p class="caption">{{ target.detail }}</p>
          </div>
        }
      </section>
    </fit-card>
  `,
  styleUrl: './goal-summary.component.scss',
  imports: [FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoalSummaryComponent {
  readonly goal = input.required<GoalViewModel>();
}
