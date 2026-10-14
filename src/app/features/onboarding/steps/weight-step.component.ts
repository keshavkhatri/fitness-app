import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { BodyWeight, UnitSystem } from '../../../domain/fitness-profile';
import { DEFAULT_WEIGHT } from '../components/body-scales';
import { WeightPickerComponent } from '../components/weight-picker.component';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { ReportImport } from '../state/report-import.service';
import { reportPrefillValues } from '../state/report-review';
import { OnboardingStepForm, STEP_HEADING_ID } from './onboarding-step-form';
import { reportNotesWithIcons } from './report-notes';

/**
 * Weight, on a horizontal ruler (or typed in). Starts from the saved answer,
 * else the InBody report's reading, else a typical value; nothing is saved
 * until the user continues or goes back having changed it.
 */
@Component({
  selector: 'app-weight-step',
  template: `
    <header class="header">
      <h1 class="title" [id]="headingId" tabindex="-1" data-step-heading>What's your weight?</h1>
      <p class="helper">Drag the ruler, tap a mark, or enter it manually.</p>
    </header>

    <app-weight-picker
      [weight]="weight()"
      [unitSystem]="unitSystem()"
      [describedBy]="note() ? 'weight-report-note' : null"
      (weightChange)="change($event)"
      (unitSystemChange)="setUnitSystem($event)"
    />

    @if (note(); as note) {
      <p class="report-note" id="weight-report-note" [attr.data-tone]="note.tone">
        <ion-icon [name]="note.icon" aria-hidden="true" />{{ note.text }}
      </p>
    }
  `,
  styleUrl: './body-step.scss',
  imports: [IonIcon, WeightPickerComponent],
  providers: [{ provide: OnboardingStepForm, useExisting: WeightStepComponent }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeightStepComponent implements OnboardingStepForm {
  private readonly flow = inject(OnboardingFlow);
  private readonly report = inject(ReportImport, { optional: true });

  protected readonly headingId = STEP_HEADING_ID;
  protected readonly unitSystem = computed(() => this.flow.draft().unitSystem);

  private readonly reading = computed(() =>
    this.flow.draft().setupMethod === 'report' ? (this.report?.reading() ?? null) : null,
  );
  protected readonly note = computed(() => {
    const reading = this.reading();
    return reading ? reportNotesWithIcons(reading).weight : null;
  });

  protected readonly weight = signal<BodyWeight>(this.initialWeight());
  private dirty = false;
  private readonly picker = viewChild.required(WeightPickerComponent);

  constructor() {
    // Going back keeps a changed weight.
    inject(DestroyRef).onDestroy(() => {
      if (this.dirty) {
        this.commit();
      }
    });
  }

  protected change(weight: BodyWeight): void {
    this.dirty = true;
    this.weight.set(weight);
  }

  /** A preference, saved at once: every screen shows measurements in it. */
  protected setUnitSystem(unitSystem: UnitSystem): void {
    this.flow.update({ unitSystem });
  }

  submit(): boolean {
    if (!this.picker().check()) {
      return false;
    }
    this.commit();
    return true;
  }

  private commit(): void {
    this.dirty = false;
    this.flow.update({ basics: { ...this.flow.draft().basics, weight: this.weight() } });
    if (this.reading()) {
      this.report?.markConfirmed('weight');
    }
  }

  private initialWeight(): BodyWeight {
    const reading = this.reading();
    const fromReport = reading && this.report?.isPrefillPending('weight') ? reportPrefillValues(reading.prefill).weight : undefined;
    return fromReport ?? this.flow.draft().basics.weight ?? DEFAULT_WEIGHT;
  }
}
