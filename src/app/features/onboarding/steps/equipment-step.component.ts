import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { EquipmentId, equipmentOfferedAt, toggleEquipment } from '../../../domain/fitness-profile';
import { ChoiceGroupComponent, ChoiceOption } from '../../../shared/ui';
import { EQUIPMENT_ICONS, EQUIPMENT_LABELS } from '../onboarding-content';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { validateStep } from '../validation/onboarding-validation';
import { OnboardingStepForm, STEP_HEADING_ID } from './onboarding-step-form';

const HELPER_BY_LOCATION = {
  gym: 'Select what your gym has. Choose “Full gym” if it has everything.',
  home: 'Select what you have at home. “Bodyweight only” works great too.',
  both: 'Select everything you can use across the gym and home.',
} as const;

@Component({
  selector: 'app-equipment-step',
  template: `
    <header class="header">
      <h1 class="title" [id]="headingId" tabindex="-1" data-step-heading>What equipment can you use?</h1>
      <p class="helper">{{ helper() }} Select all that apply; you can change this later.</p>
    </header>

    <fit-choice-group
      class="equipment"
      name="equipment"
      layout="grid"
      multiple
      [columns]="3"
      [labelledBy]="headingId"
      [describedBy]="error() ? errorId : null"
      [invalid]="!!error()"
      [options]="options()"
      [selected]="flow.draft().equipment"
      (optionToggled)="toggle($event)"
    />

    <p class="error" [id]="errorId" aria-live="polite">
      @if (error(); as message) {
        <ion-icon name="alert-circle-outline" aria-hidden="true" />{{ message }}
      }
    </p>
  `,
  styleUrl: './equipment-step.component.scss',
  imports: [IonIcon, ChoiceGroupComponent],
  providers: [{ provide: OnboardingStepForm, useExisting: EquipmentStepComponent }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EquipmentStepComponent implements OnboardingStepForm {
  protected readonly flow = inject(OnboardingFlow);
  private readonly group = viewChild.required(ChoiceGroupComponent);

  protected readonly headingId = STEP_HEADING_ID;
  protected readonly errorId = 'onboarding-step-error';
  protected readonly error = signal<string | null>(null);

  /** Only equipment relevant to the chosen location is offered. */
  protected readonly options = computed<readonly ChoiceOption<EquipmentId>[]>(() =>
    equipmentOfferedAt(this.flow.draft().trainingLocation).map((item) => ({
      value: item.id,
      label: EQUIPMENT_LABELS[item.id],
      icon: EQUIPMENT_ICONS[item.id],
    })),
  );

  protected readonly helper = computed(() => {
    const location = this.flow.draft().trainingLocation;
    return location ? HELPER_BY_LOCATION[location] : HELPER_BY_LOCATION.both;
  });

  protected toggle(id: EquipmentId): void {
    this.flow.update({ equipment: toggleEquipment(this.flow.draft().equipment, id) });
    this.error.set(null);
  }

  submit(): boolean {
    const error = validateStep('equipment', this.flow.draft());
    this.error.set(error);
    if (error) {
      this.group().focus();
    }
    return error === null;
  }
}
