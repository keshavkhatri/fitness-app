import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { FitnessButtonComponent, FitnessCardComponent } from '../../../../shared/ui';
import { HomeGoalView } from '../../home-goal';

/**
 * The user's goal as saved in their profile, with a way to review it.
 * No progress is shown: the app doesn't track goal progress yet.
 */
@Component({
  selector: 'app-goal-summary-card',
  template: `
    @let g = goal();
    <fit-card>
      @if (g.kind === 'ready') {
        <h3 class="title" data-testid="goal-title">{{ g.title }}</h3>
        <p class="description">{{ g.description }}</p>
        @if (g.target; as t) {
          <div class="target-block" data-testid="goal-target">
            @if (t.kind === 'target') {
              <p class="target">{{ t.detail }}</p>
              <p class="target-change">{{ t.change }}</p>
            } @else {
              <p class="target-change">No target weight set</p>
            }
          </div>
        }
        <button fit-button type="button" variant="outline" block class="cta" (click)="reviewProfile.emit()">Review my details</button>
      } @else {
        <h3 class="title">Set your goal</h3>
        <p class="description">Complete your profile to choose a goal and get your plan and targets.</p>
        <button fit-button type="button" block class="cta" (click)="setUpProfile.emit()">Set up profile</button>
      }
    </fit-card>
  `,
  styleUrl: './goal-summary-card.component.scss',
  imports: [FitnessButtonComponent, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoalSummaryCardComponent {
  readonly goal = input.required<HomeGoalView>();
  /** Edit the saved profile (goal, target). */
  readonly reviewProfile = output<void>();
  /** No profile yet: start onboarding. */
  readonly setUpProfile = output<void>();
}
