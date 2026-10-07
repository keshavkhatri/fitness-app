import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { Sex, UnitSystem, weightUnitLabel } from '../../../domain/fitness-profile';
import { ChoiceGroupComponent, SegmentedControlComponent, TextFieldComponent } from '../../../shared/ui';
import { SEX_OPTIONS, UNIT_SYSTEM_OPTIONS } from '../onboarding-content';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import {
  BasicsErrors,
  BasicsField,
  BasicsFormInput,
  basicsFormFromDraft,
  convertBasicsForm,
  validateBasicsForm,
} from '../validation/onboarding-validation';
import { OnboardingStepForm, STEP_HEADING_ID } from './onboarding-step-form';

const FIELD_ORDER: readonly BasicsField[] = ['dateOfBirth', 'sex', 'height', 'weight'];

@Component({
  selector: 'app-basics-step',
  templateUrl: './basics-step.component.html',
  styleUrl: './basics-step.component.scss',
  imports: [IonIcon, ChoiceGroupComponent, SegmentedControlComponent, TextFieldComponent],
  providers: [{ provide: OnboardingStepForm, useExisting: BasicsStepComponent }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BasicsStepComponent implements OnboardingStepForm {
  private readonly flow = inject(OnboardingFlow);

  protected readonly headingId = STEP_HEADING_ID;
  protected readonly sexOptions = SEX_OPTIONS;
  protected readonly unitOptions = UNIT_SYSTEM_OPTIONS;

  /** Raw form state; committed to the flow only once valid. */
  protected readonly form = signal<BasicsFormInput>(basicsFormFromDraft(this.flow.draft()));
  private readonly submitted = signal(false);

  /** Errors appear after the first Continue, then update live as the user fixes them. */
  protected readonly errors = computed<BasicsErrors>(() => {
    if (!this.submitted()) {
      return {};
    }
    const result = validateBasicsForm(this.form());
    return result.ok ? {} : result.errors;
  });

  protected readonly isMetric = computed(() => this.form().unitSystem === 'metric');
  protected readonly weightUnit = computed(() => weightUnitLabel(this.form().unitSystem));
  protected readonly selectedSex = computed(() => {
    const sex = this.form().sex;
    return sex ? [sex] : [];
  });

  private readonly birthDayField = viewChild.required<TextFieldComponent>('birthDayField');
  private readonly sexGroup = viewChild.required(ChoiceGroupComponent);
  private readonly heightField = viewChild.required<TextFieldComponent>('heightField');
  private readonly weightField = viewChild.required<TextFieldComponent>('weightField');

  protected patch(change: Partial<BasicsFormInput>): void {
    this.form.update((form) => ({ ...form, ...change }));
  }

  protected setSex(sex: Sex): void {
    this.patch({ sex });
  }

  protected setUnitSystem(unitSystem: UnitSystem): void {
    this.form.update((form) => convertBasicsForm(form, unitSystem));
    // Saved immediately: it's a preference, and later steps display in it.
    this.flow.update({ unitSystem });
  }

  submit(): boolean {
    this.submitted.set(true);
    const result = validateBasicsForm(this.form());
    if (result.ok) {
      this.flow.update({ basics: result.value, unitSystem: this.form().unitSystem });
      return true;
    }
    this.focusField(FIELD_ORDER.find((field) => result.errors[field]) ?? 'dateOfBirth');
    return false;
  }

  private focusField(field: BasicsField): void {
    const targets: Record<BasicsField, { focus(): void }> = {
      dateOfBirth: this.birthDayField(),
      sex: this.sexGroup(),
      height: this.heightField(),
      weight: this.weightField(),
    };
    targets[field].focus();
  }
}
