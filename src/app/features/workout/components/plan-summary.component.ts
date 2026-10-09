import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { PlanFactView } from '../workout-view-model';

/** The plan's key facts (goal, days, experience, location) as a compact definition list. */
@Component({
  selector: 'app-plan-summary',
  template: `
    <dl class="facts">
      @for (fact of facts(); track fact.label) {
        <div class="fact">
          <dt class="label">{{ fact.label }}</dt>
          <dd class="value">
            {{ fact.value }}
            @if (fact.detail; as detail) {
              <span class="detail">{{ detail }}</span>
            }
          </dd>
        </div>
      }
    </dl>
  `,
  styleUrl: './plan-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanSummaryComponent {
  readonly facts = input.required<readonly PlanFactView[]>();
}
