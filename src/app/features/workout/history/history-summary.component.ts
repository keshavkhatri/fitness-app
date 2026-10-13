import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { WORKOUT_COPY } from '../workout-content';
import { HistoryDetailView, HistoryExerciseView } from './history-view-model';

/**
 * A finished workout's Summary view: the recorded totals, then what the plan
 * prescribed for each exercise at the time and how much of it was done.
 */
@Component({
  selector: 'app-history-summary',
  template: `
    <div class="summary" data-testid="history-summary">
      <dl class="facts">
        @for (fact of facts(); track fact.key) {
          <div class="fact" [attr.data-key]="fact.key">
            <dt>{{ fact.label }}</dt>
            <dd>{{ fact.value }}</dd>
          </div>
        }
      </dl>
      <h3 class="planned-title">{{ copy.detail.planned }}</h3>
      <ol class="planned-list">
        @for (exercise of exercises(); track exercise.key) {
          <li>
            <span class="planned-name">{{ exercise.name }}</span>
            <span class="planned-value" data-testid="planned">
              @for (part of exercise.plannedParts; track $index; let first = $first) {
                @if (!first) {
                  <span class="separator" aria-hidden="true"> · </span>
                }
                <span class="part">{{ part }}</span>
              }
            </span>
            <span class="planned-progress">{{ exercise.progress }}</span>
          </li>
        }
      </ol>
    </div>
  `,
  styleUrl: './history-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistorySummaryComponent {
  readonly facts = input.required<HistoryDetailView['facts']>();
  readonly exercises = input.required<readonly HistoryExerciseView[]>();

  protected readonly copy = WORKOUT_COPY.history;
}
