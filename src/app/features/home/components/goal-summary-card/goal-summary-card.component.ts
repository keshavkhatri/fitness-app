import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { HomeGoalView } from '../../home-goal';
import { StatTileComponent } from '../stat-tile/stat-tile.component';

/**
 * The user's goal as saved in their profile, as a bento tile that opens the
 * profile review. No progress is shown: the app doesn't track goal progress yet.
 */
@Component({
  selector: 'app-goal-summary-card',
  template: `
    @let g = goal();
    @if (g.kind === 'ready') {
      <button app-stat-tile type="button" icon="flag-outline" heading="Goal" tone="goal" [label]="label()" (click)="reviewProfile.emit()">
        <span class="title" data-testid="goal-title">{{ g.title }}</span>
        @if (g.target; as t) {
          <span class="target" data-testid="goal-target">
            @if (t.kind === 'target') {
              <span class="sub">{{ t.detail }}</span>
              <span class="sub">{{ t.change }}</span>
            } @else {
              <span class="sub">No target weight set</span>
            }
          </span>
        } @else {
          <span class="sub">{{ g.description }}</span>
        }
        <span class="foot">Review</span>
      </button>
    } @else {
      <button app-stat-tile type="button" icon="flag-outline" heading="Goal" tone="goal" label="Set your goal. Set up profile." (click)="setUpProfile.emit()">
        <span class="title">Set your goal</span>
        <span class="foot">Set up profile</span>
      </button>
    }
  `,
  styleUrl: './goal-summary-card.component.scss',
  imports: [StatTileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoalSummaryCardComponent {
  readonly goal = input.required<HomeGoalView>();
  /** Edit the saved profile (goal, target). */
  readonly reviewProfile = output<void>();
  /** No profile yet: start onboarding. */
  readonly setUpProfile = output<void>();

  protected readonly label = computed(() => {
    const g = this.goal();
    if (g.kind !== 'ready') {
      return '';
    }
    const target = g.target?.kind === 'target' ? ` ${g.target.detail}, ${g.target.change}.` : g.target ? ' No target weight set.' : ` ${g.description}.`;
    return `Goal: ${g.title}.${target} Review my details.`;
  });
}
