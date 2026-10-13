import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { FitnessCardComponent, NoticeComponent } from '../../../shared/ui';
import { ASSESSMENT_COPY } from '../assessment-content';
import { EnergyViewModel } from '../assessment-view-model';

/** Starting calorie target (hero) plus the estimates it is based on. */
@Component({
  selector: 'app-energy-summary',
  template: `
    @let target = energy().calorieTarget;
    <fit-card>
      @if (target.kind === 'target') {
        <div class="hero" data-testid="calorie-target">
          <p class="hero-label">{{ copy.targetLabel }}</p>
          <p class="hero-value">
            <span class="hero-number">{{ target.kcal }}</span>
            <span class="hero-unit" aria-hidden="true">kcal/day</span>
            <span class="visually-hidden">kilocalories per day</span>
          </p>
          <p class="caption">{{ copy.targetCaption }}</p>
        </div>
        @if (target.notice; as notice) {
          <fit-notice class="notice" [tone]="notice.tone" [title]="notice.title">{{ notice.message }}</fit-notice>
        }
      } @else {
        <!-- The domain asked for review: the target is not presented as a recommendation. -->
        <fit-notice tone="warning" [title]="target.notice.title" data-testid="calorie-review">
          {{ target.notice.message }}
        </fit-notice>
      }

      <dl class="estimates">
        <div class="estimate">
          <dt>{{ copy.bmrLabel }}</dt>
          <dd class="value" data-testid="bmr">{{ energy().bmr }}</dd>
          <dd class="caption">{{ copy.bmrCaption }}</dd>
        </div>
        <div class="estimate">
          <dt>{{ copy.maintenanceLabel }}</dt>
          <dd class="value" data-testid="maintenance">{{ energy().maintenance }}</dd>
          <dd class="caption" data-testid="maintenance-caption">{{ energy().maintenanceCaption }}</dd>
        </div>
      </dl>
    </fit-card>
  `,
  styleUrl: './energy-summary.component.scss',
  imports: [FitnessCardComponent, NoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergySummaryComponent {
  readonly energy = input.required<EnergyViewModel>();
  protected readonly copy = ASSESSMENT_COPY.energy;
}
