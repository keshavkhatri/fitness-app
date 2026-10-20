import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';

import {
  GOAL_TARGET_POLICIES,
  PrimaryGoal,
  formatWeight,
  isTargetWeightDirectionValid,
  weightInUnit,
  weightUnitLabel,
} from '../../../domain/fitness-profile';
import { FitnessButtonComponent, TextFieldComponent } from '../../../shared/ui';
import { GOAL_TARGET_COPY } from '../onboarding-content';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { parseWeightInput, validateTargetWeightInput } from '../validation/onboarding-validation';
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
      @if (switchTo(); as other) {
        <!-- A target the other way round needs the other goal (a deficit can't add weight, a surplus can't lose it). -->
        <div class="switch" data-testid="target-switch-goal">
          <p class="switch-text">{{ other.reason }}</p>
          <button fit-button type="button" variant="outline" block (click)="switchGoal(other.goal)">{{ other.label }}</button>
        </div>
      }
    }
  `,
  styleUrl: './single-choice-step.component.scss',
  imports: [FitnessButtonComponent, TextFieldComponent],
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
  /** Set when the target points the other way from the goal: the goal that fits it, offered as one tap. */
  protected readonly switchTo = signal<{ readonly goal: PrimaryGoal; readonly label: string; readonly reason: string } | null>(null);

  /** Switches the goal to the one that fits the target, keeps the target, and checks it again. */
  protected switchGoal(goal: PrimaryGoal): void {
    this.flow.update({ primaryGoal: goal });
    this.switchTo.set(null);
    this.error.set(null);
    this.submitQuietly();
  }

  private submitQuietly(): void {
    const goal = this.goal();
    if (!goal) {
      return;
    }
    const result = validateTargetWeightInput(this.targetWeight(), goal, this.unitSystem(), this.flow.draft().basics?.weight ?? null);
    if (result.ok) {
      this.flow.update({ goalTarget: { ...this.flow.draft().goalTarget, targetWeight: result.value } });
    }
  }

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
      this.switchTo.set(this.otherGoalFor(goal));
      this.field()?.focus();
      return false;
    }
    this.error.set(null);
    this.switchTo.set(null);
    this.flow.update({ goalTarget: { ...this.flow.draft().goalTarget, targetWeight: result.value } });
    return true;
  }

  /** Losing fat with a higher target means gaining (Build muscle); building muscle with a lower one means losing (Lose fat). */
  private otherGoalFor(goal: PrimaryGoal): { goal: PrimaryGoal; label: string; reason: string } | null {
    const current = this.flow.draft().basics?.weight;
    const target = parseWeightInput(this.targetWeight(), this.unitSystem());
    if (!current || !target || isTargetWeightDirectionValid(goal, target, current)) {
      return null;
    }
    const shown = formatWeight(target, this.unitSystem());
    if (goal === 'lose-fat' && target.kilograms > current.kilograms) {
      return {
        goal: 'build-muscle',
        label: `Switch to Build muscle and keep ${shown}`,
        reason: "Reaching a higher weight means gaining, which Lose fat (a calorie deficit) can't do. Build muscle aims for a gain.",
      };
    }
    if (goal === 'build-muscle' && target.kilograms < current.kilograms) {
      return {
        goal: 'lose-fat',
        label: `Switch to Lose fat and keep ${shown}`,
        reason: "Reaching a lower weight means losing, which Build muscle (a calorie surplus) can't do. Lose fat aims for a loss.",
      };
    }
    return null;
  }

  private initialTargetText(): string {
    const target = this.flow.draft().goalTarget.targetWeight;
    return target ? String(weightInUnit(target, this.flow.draft().unitSystem)) : '';
  }
}
