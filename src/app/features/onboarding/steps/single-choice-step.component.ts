import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { ChoiceGroupComponent, ChoiceGroupLayout, ChoiceOption } from '../../../shared/ui';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { OnboardingDraft } from '../state/onboarding-draft';
import { OnboardingStepId } from '../state/onboarding-steps';
import { validateStep } from '../validation/onboarding-validation';
import { OnboardingStepForm, STEP_HEADING_ID } from './onboarding-step-form';

type ChoiceValue = string | number;

export interface SingleChoiceStepConfig<T extends ChoiceValue = ChoiceValue> {
  readonly stepId: OnboardingStepId;
  readonly question: string;
  readonly helper?: string;
  readonly options: readonly ChoiceOption<T>[];
  readonly layout?: ChoiceGroupLayout;
  readonly columns?: number;
  /** A tip under the options. */
  readonly note?: { readonly icon: string; readonly title: string; readonly text: string };
  /** Current answer from the draft. */
  readonly read: (draft: OnboardingDraft) => T | null;
  /** Draft change for a newly chosen answer. */
  readonly change: (value: T) => Partial<OnboardingDraft>;
}

/**
 * Erases the option type so differently-typed configs fit one input. Safe
 * because `change` only ever receives values from the same config's `options`.
 */
export function defineChoiceStep<T extends ChoiceValue>(config: SingleChoiceStepConfig<T>): SingleChoiceStepConfig {
  return config as unknown as SingleChoiceStepConfig;
}

/** Generic "pick one" step: question, options, inline validation. */
@Component({
  selector: 'app-single-choice-step',
  template: `
    @let c = config();
    <header class="header">
      <h1 class="title" [id]="headingId" tabindex="-1" data-step-heading>{{ c.question }}</h1>
      @if (c.helper) {
        <p class="helper">{{ c.helper }}</p>
      }
    </header>

    <fit-choice-group
      [name]="c.stepId"
      [labelledBy]="headingId"
      [describedBy]="error() ? errorId : null"
      [invalid]="!!error()"
      [options]="c.options"
      [selected]="selected()"
      [layout]="c.layout ?? 'list'"
      [columns]="c.columns ?? 2"
      (optionToggled)="choose($event)"
    />

    <p class="error" [id]="errorId" aria-live="polite">
      @if (error(); as message) {
        <ion-icon name="alert-circle-outline" aria-hidden="true" />{{ message }}
      }
    </p>

    @if (c.note; as note) {
      <aside class="note">
        <ion-icon [name]="note.icon" aria-hidden="true" />
        <p><strong>{{ note.title }}</strong> {{ note.text }}</p>
      </aside>
    }
  `,
  styleUrl: './single-choice-step.component.scss',
  imports: [IonIcon, ChoiceGroupComponent],
  providers: [{ provide: OnboardingStepForm, useExisting: SingleChoiceStepComponent }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SingleChoiceStepComponent implements OnboardingStepForm {
  readonly config = input.required<SingleChoiceStepConfig>();

  private readonly flow = inject(OnboardingFlow);
  private readonly group = viewChild.required(ChoiceGroupComponent);

  protected readonly headingId = STEP_HEADING_ID;
  protected readonly errorId = 'onboarding-step-error';
  protected readonly error = signal<string | null>(null);
  protected readonly selected = computed(() => {
    const value = this.config().read(this.flow.draft());
    return value === null ? [] : [value];
  });

  protected choose(value: ChoiceValue): void {
    this.flow.update(this.config().change(value));
    this.error.set(null);
  }

  submit(): boolean {
    const error = validateStep(this.config().stepId, this.flow.draft());
    this.error.set(error);
    if (error) {
      this.group().focus();
    }
    return error === null;
  }
}
