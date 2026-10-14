import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { ASSESSMENT_COPY } from '../assessment-content';

export type NextStepId = 'workout' | 'nutrition' | 'progress' | 'adjust';

interface NextStep {
  readonly id: NextStepId;
  readonly icon: string;
  readonly title: string;
  readonly text: string;
}

/** Each opens an existing screen (see AssessmentPage.openNextStep). */
const NEXT_STEPS: readonly NextStep[] = [
  { id: 'workout', icon: 'barbell', title: 'Start your workout plan', text: 'Your training plan, built from your goal and equipment.' },
  { id: 'nutrition', icon: 'restaurant-outline', title: 'Track your nutrition', text: 'Log your meals to stay within your calorie and macro targets.' },
  { id: 'progress', icon: 'stats-chart', title: 'Monitor your progress', text: 'Track your workouts, weight and measurements over time.' },
  { id: 'adjust', icon: 'options-outline', title: 'Adjust anytime', text: 'Update your details later to get new targets.' },
];

/** Next steps (light): where to go from here. */
@Component({
  selector: 'app-assessment-next',
  template: `
    <header class="header">
      <h1 class="title" tabindex="-1" data-view-heading>{{ copy.title }}</h1>
      <p class="lead">{{ copy.intro }}</p>
    </header>

    <ul class="steps">
      @for (step of steps; track step.id; let first = $first) {
        <li>
          <button
            type="button"
            class="step"
            [class.featured]="first"
            [disabled]="busy()"
            [attr.data-testid]="'next-' + step.id"
            (click)="selected.emit(step.id)"
          >
            <span class="icon" aria-hidden="true"><ion-icon [name]="step.icon" /></span>
            <span class="step-text">
              <span class="step-title">{{ step.title }}</span>&ngsp;
              <span class="step-description">{{ step.text }}</span>
            </span>
            <ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
          </button>
        </li>
      }
    </ul>
  `,
  styleUrl: './next-steps-view.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NextStepsViewComponent {
  /** True while navigating away: the cards wait. */
  readonly busy = input(false);
  readonly selected = output<NextStepId>();

  protected readonly copy = ASSESSMENT_COPY.views.next;
  protected readonly steps = NEXT_STEPS;
}
