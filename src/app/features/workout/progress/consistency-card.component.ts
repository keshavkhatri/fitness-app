import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { FitnessProgressComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { ConsistencyView } from './progress-view-model';

/**
 * Weeks with a finished workout: a ring with the share of counted weeks, and
 * one bar per week (workouts finished). The plan's weekly sessions are a
 * dashed reference line, so completed and planned are never confused. Each
 * week is listed in words for screen readers.
 */
@Component({
  selector: 'app-consistency-card',
  template: `
    @let c = consistency();
    <section class="card" aria-labelledby="progress-consistency" data-testid="consistency">
      <h2 class="title" id="progress-consistency">{{ copy.title }}</h2>
      <p class="summary" data-testid="consistency-summary">{{ c.summary }}</p>

      <div class="body">
        <fit-progress
          class="ring"
          variant="ring"
          [ringSize]="88"
          [thickness]="4"
          [value]="c.activeWeeks"
          [max]="c.weeksCounted"
          [label]="copy.ring"
          [valueText]="c.summary"
        >
          <span class="percent" aria-hidden="true">{{ c.percent }}%</span>
        </fit-progress>

        <div class="chart" aria-hidden="true">
          <div class="bars">
            @if (c.planned; as p) {
              <span class="planned" [style.bottom.%]="p.height * 100"><span class="planned-label">{{ p.label }}</span></span>
            }
            @for (week of c.weeks; track week.key) {
              <span class="bar-slot">
                <span class="bar" [class.current]="week.isCurrent" [class.zero]="week.workouts === 0" [style.height.%]="week.workouts === 0 ? 0 : week.height * 100">
                  @if (week.workouts > 0) {
                    <span class="count">{{ week.workouts }}</span>
                  }
                </span>
              </span>
            }
          </div>
          <div class="axis">
            <span>{{ c.axis.start }}</span>
            <span>{{ c.axis.end }}</span>
          </div>
        </div>
      </div>

      <ol class="visually-hidden">
        @for (week of c.weeks; track week.key) {
          <li>{{ week.spoken }}</li>
        }
        @if (c.planned; as p) {
          <li>{{ p.label }}</li>
        }
      </ol>
    </section>
  `,
  styleUrl: './consistency-card.component.scss',
  imports: [FitnessProgressComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsistencyCardComponent {
  readonly consistency = input.required<ConsistencyView>();

  protected readonly copy = WORKOUT_COPY.progress.consistency;
}
