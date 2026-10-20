import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { PlanIntent, PlanIntentService } from '../../../core/workout/plan-intent.service';
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

    @if (preview(); as days) {
      <section class="preview" aria-labelledby="plan-preview-title" data-testid="plan-preview">
        <h2 class="preview-title" id="plan-preview-title">Your training week</h2>
        <ol class="days">
          @for (day of days; track day.id) {
            <li class="day">
              <span class="day-index" aria-hidden="true">{{ day.dayIndex }}</span>
              <span class="day-text">
                <span class="day-name">Day {{ day.dayIndex }} · {{ day.name }}</span>&ngsp;
                <span class="day-detail">{{ day.detail }}</span>
              </span>
            </li>
          }
        </ol>
        <p class="preview-note">Times are rough estimates. The full plan, with every exercise, is in the Train tab.</p>
      </section>
    }

    @if (preview()) {
      <!-- A choice, not a link: building your own plan happens after setup (see PlanIntentService). -->
      <section class="choice" aria-labelledby="plan-choice-title" data-testid="plan-choice">
        <h2 class="preview-title" id="plan-choice-title">Choose how to train</h2>
        <div class="options" role="radiogroup" aria-labelledby="plan-choice-title">
          <button
            type="button"
            class="option action"
            role="radio"
            [class.selected]="intent() === 'generated'"
            [attr.aria-checked]="intent() === 'generated'"
            data-testid="choice-generated"
            (click)="choose('generated')"
          >
            <ion-icon [name]="intent() === 'generated' ? 'checkmark-circle' : 'ellipse-outline'" aria-hidden="true" />
            <span class="item"><strong>Use generated plan</strong> Free. You'll start with the plan above.</span>
          </button>
          <button
            type="button"
            class="option action"
            role="radio"
            [class.selected]="intent() === 'custom'"
            [attr.aria-checked]="intent() === 'custom'"
            data-testid="choice-build"
            (click)="choose('custom')"
          >
            <ion-icon [name]="intent() === 'custom' ? 'checkmark-circle' : 'ellipse-outline'" aria-hidden="true" />
            <span class="item"><strong>Build my own <span class="badge">Pro</span></strong> Choose your own exercises and edit your plan any time.</span>
          </button>
        </div>
        @if (intent() === 'custom') {
          <p class="preview-note" role="status" data-testid="choice-build-note">
            You'll set it up after the next two screens. It starts from your generated plan, so you can keep what you like.
          </p>
        }
      </section>
    }

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

  private readonly intents = inject(PlanIntentService);
  /** "Use generated plan" (default) or "Build my own"; acted on after setup, never here. */
  protected readonly intent = this.intents.intent;

  constructor() {
    void this.intents.load();
  }

  protected choose(intent: PlanIntent): void {
    void this.intents.set(intent);
  }

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

  /** The real plan, one line per planned day (null until it is made, or if it couldn't be). */
  protected readonly preview = computed(() => {
    const state = this.state();
    if (state === null || state === 'failed' || state.kind !== 'ready') {
      return null;
    }
    return state.plan.sessions.map((session) => ({
      id: session.id,
      dayIndex: session.dayIndex,
      name: session.name,
      detail:
        session.kind === 'resistance'
          ? `${session.exercises.length} exercises · about ${session.estimatedDurationMinutes} min`
          : `${session.optional ? 'Optional · ' : ''}${session.durationMinutes.min}–${session.durationMinutes.max} min, easy`,
    }));
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
