import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';

import {
  GOAL_TARGET_POLICIES,
  formatWeight,
  weightInUnit,
  weightUnitLabel,
} from '../../../domain/fitness-profile';
import { TextFieldComponent } from '../../../shared/ui';
import { GOAL_TARGET_COPY } from '../onboarding-content';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { validateTargetWeightInput } from '../validation/onboarding-validation';
import { OnboardingStepForm, STEP_HEADING_ID } from './onboarding-step-form';

const DEFAULT_COPY = { question: 'Do you have a target?', helper: 'Optional.' };

/**
 * Goal-specific targets. Which fields appear is driven by the domain's
 * GOAL_TARGET_POLICIES, so new target kinds plug in here as new fields.
 * The step is skipped entirely for goals with no applicable targets.
 */
@Component({
  selector: 'app-goal-target-step',
  template: `
    <header class="header">
      <h1 class="title" [id]="headingId" tabindex="-1" data-step-heading>{{ copy().question }}</h1>
      <p class="helper">{{ copy().helper }}</p>
    </header>

    @if (showsTargetWeight()) {
      <fit-text-field
        label="Target weight (optional)"
        inputMode="decimal"
        enterKeyHint="done"
        [suffix]="unit()"
        [maxLength]="6"
        [value]="targetWeight()"
        (valueChange)="targetWeight.set($event)"
        [hint]="currentWeightHint()"
        [error]="error()"
      />
    }
  `,
  styleUrl: './single-choice-step.component.scss',
  imports: [TextFieldComponent],
  providers: [{ provide: OnboardingStepForm, useExisting: GoalTargetStepComponent }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoalTargetStepComponent implements OnboardingStepForm {
  private readonly flow = inject(OnboardingFlow);
  private readonly field = viewChild(TextFieldComponent);

  protected readonly headingId = STEP_HEADING_ID;
  private readonly goal = computed(() => this.flow.draft().primaryGoal);
  private readonly unitSystem = computed(() => this.flow.draft().unitSystem);

  protected readonly copy = computed(() => {
    const goal = this.goal();
    return (goal && GOAL_TARGET_COPY[goal]) || DEFAULT_COPY;
  });
  protected readonly showsTargetWeight = computed(() => {
    const goal = this.goal();
    return !!goal && GOAL_TARGET_POLICIES[goal].targetWeight !== 'not-applicable';
  });
  protected readonly unit = computed(() => weightUnitLabel(this.unitSystem()));
  protected readonly currentWeightHint = computed(() => {
    const current = this.flow.draft().basics?.weight;
    return current ? `Current weight: ${formatWeight(current, this.unitSystem())}` : undefined;
  });

  protected readonly targetWeight = signal(this.initialTargetText());
  protected readonly error = signal<string | null>(null);

  submit(): boolean {
    const goal = this.goal();
    if (!goal) {
      return true;
    }
    const result = validateTargetWeightInput(
      this.targetWeight(),
      goal,
      this.unitSystem(),
      this.flow.draft().basics?.weight ?? null,
    );
    if (!result.ok) {
      this.error.set(result.errors);
      this.field()?.focus();
      return false;
    }
    this.error.set(null);
    this.flow.update({ goalTarget: { ...this.flow.draft().goalTarget, targetWeight: result.value } });
    return true;
  }

  private initialTargetText(): string {
    const target = this.flow.draft().goalTarget.targetWeight;
    return target ? String(weightInUnit(target, this.flow.draft().unitSystem)) : '';
  }
}
