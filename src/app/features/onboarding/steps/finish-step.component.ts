import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { WorkoutPlanService, WorkoutPlanState } from '../../../core/workout/workout-plan.service';
import { STEP_HEADING_ID } from './onboarding-step-form';

/** Decorative confetti: [left %, top %, rotation deg, tone]. */
const CONFETTI: readonly (readonly [number, number, number, 0 | 1 | 2])[] = [
  [8, 6, 20, 0], [22, 18, -30, 1], [36, 2, 45, 2], [64, 4, -15, 0], [78, 16, 60, 1], [90, 6, -40, 2],
  [14, 34, 70, 2], [86, 32, 10, 0], [4, 52, -60, 1], [94, 50, 35, 1],
];

/**
 * After the profile is saved. Says the workout plan is ready only once it
 * has actually been made: the plan is created here (as Home would on first
 * open) and the screen reports what happened. Continues to the assessment,
 * which shows the starting calorie target (Home opens after it).
 */
@Component({
  selector: 'app-finish-step',
  template: `
    <div class="confetti" aria-hidden="true">
      @for (piece of confetti; track $index) {
        <span [class]="'piece tone-' + piece[3]" [style.left.%]="piece[0]" [style.top.%]="piece[1]" [style.rotate.deg]="piece[2]"></span>
      }
    </div>

    <div class="mark" aria-hidden="true"><ion-icon name="checkmark" /></div>
    <h1 class="title" [id]="headingId" tabindex="-1" data-step-heading>You're all set!</h1>
    <p class="text" aria-live="polite">{{ status() }}</p>

    <ul class="next">
      <li>
        <span class="icon" aria-hidden="true"><ion-icon name="barbell-outline" /></span>
        <span class="item"><strong>Workout plan</strong> {{ planText() }}</span>
      </li>
      <li>
        <span class="icon" aria-hidden="true"><ion-icon name="restaurant-outline" /></span>
        <span class="item"><strong>Calorie target</strong> Your starting target is on the next screen, with how it was worked out.</span>
      </li>
      <li>
        <span class="icon" aria-hidden="true"><ion-icon name="stats-chart-outline" /></span>
        <span class="item"><strong>Progress tracking</strong> Log workouts, weight and measurements as you go.</span>
      </li>
    </ul>
  `,
  styleUrl: './finish-step.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinishStepComponent {
  private readonly plans = inject(WorkoutPlanService);

  protected readonly headingId = STEP_HEADING_ID;
  protected readonly confetti = CONFETTI;

  private readonly plan = resource({
    loader: (): Promise<WorkoutPlanState | null> => this.plans.load().catch(() => null),
  });
  /** null while the plan is being made. */
  private readonly state = computed<WorkoutPlanState | 'failed' | null>(() =>
    this.plan.isLoading() ? null : (this.plan.hasValue() ? this.plan.value() : null) ?? 'failed',
  );

  protected readonly status = computed(() => {
    const state = this.state();
    if (state === null) {
      return 'Your profile is saved. Building your workout plan…';
    }
    return state !== 'failed' && state.kind === 'ready'
      ? 'Your profile is saved and your workout plan is ready.'
      : 'Your profile is saved.';
  });

  protected readonly planText = computed(() => {
    const state = this.state();
    if (state === null) {
      return 'Building your plan…';
    }
    if (state !== 'failed' && state.kind === 'ready') {
      return `${state.plan.daysPerWeek} days a week, built from your goal, experience and equipment.`;
    }
    return "Couldn't be made from these answers yet. Change them in your profile at any time.";
  });
}
