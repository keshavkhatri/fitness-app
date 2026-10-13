import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';

import { NAME_MAX_LENGTH, normalizeName } from '../../../core/identity/user-identity.service';
import { TextFieldComponent } from '../../../shared/ui';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { STEP_REQUIRED_MESSAGES } from '../validation/onboarding-validation';
import { OnboardingStepForm, STEP_HEADING_ID } from './onboarding-step-form';

/**
 * The name Home greets the user with. Kept on this device with their other
 * details; it can be changed later (You → name and photo).
 */
@Component({
  selector: 'app-name-step',
  template: `
    <header class="header">
      <h1 class="title" [id]="headingId" tabindex="-1" data-step-heading>What should we call you?</h1>
      <p class="helper">We’ll use it to greet you.</p>
    </header>

    <fit-text-field
      label="Your name"
      autocomplete="given-name"
      enterKeyHint="next"
      [maxLength]="maxLength"
      [value]="name()"
      (valueChange)="name.set($event); error.set(null)"
      [error]="error()"
      [invalid]="!!error()"
    />
  `,
  styleUrl: './single-choice-step.component.scss',
  imports: [TextFieldComponent],
  providers: [{ provide: OnboardingStepForm, useExisting: NameStepComponent }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NameStepComponent implements OnboardingStepForm {
  private readonly flow = inject(OnboardingFlow);
  private readonly field = viewChild(TextFieldComponent);

  protected readonly headingId = STEP_HEADING_ID;
  protected readonly maxLength = NAME_MAX_LENGTH;
  protected readonly name = signal(this.flow.draft().name ?? '');
  protected readonly error = signal<string | null>(null);

  submit(): boolean {
    const name = normalizeName(this.name());
    if (!name) {
      this.error.set(STEP_REQUIRED_MESSAGES.name ?? null);
      this.field()?.focus();
      return false;
    }
    this.error.set(null);
    this.flow.update({ name });
    return true;
  }
}
