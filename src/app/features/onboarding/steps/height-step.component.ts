import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { BodyHeight, UnitSystem } from '../../../domain/fitness-profile';
import { DEFAULT_HEIGHT } from '../components/body-scales';
import { HeightPickerComponent } from '../components/height-picker.component';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { ReportImport } from '../state/report-import.service';
import { reportPrefillValues } from '../state/report-review';
import { OnboardingStepForm, STEP_HEADING_ID } from './onboarding-step-form';
import { reportNotesWithIcons } from './report-notes';

/**
 * Height, on a vertical ruler (or typed in). Starts from the saved answer,
 * else the InBody report's reading, else a typical value; nothing is saved
 * until the user continues or goes back having changed it.
 */
@Component({
  selector: 'app-height-step',
  template: `
    <header class="header">
      <h1 class="title" [id]="headingId" tabindex="-1" data-step-heading>What's your height?</h1>
      <p class="helper">Drag the ruler, tap a mark, or enter it manually.</p>
    </header>

    <app-height-picker
      [height]="height()"
      [unitSystem]="unitSystem()"
      [describedBy]="note() ? 'height-report-note' : null"
      (heightChange)="change($event)"
      (unitSystemChange)="setUnitSystem($event)"
    />

    @if (note(); as note) {
      <p class="report-note" id="height-report-note" [attr.data-tone]="note.tone">
        <ion-icon [name]="note.icon" aria-hidden="true" />{{ note.text }}
      </p>
    }
  `,
  styleUrl: './body-step.scss',
  imports: [IonIcon, HeightPickerComponent],
  providers: [{ provide: OnboardingStepForm, useExisting: HeightStepComponent }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeightStepComponent implements OnboardingStepForm {
  private readonly flow = inject(OnboardingFlow);
  private readonly report = inject(ReportImport, { optional: true });

  protected readonly headingId = STEP_HEADING_ID;
  protected readonly unitSystem = computed(() => this.flow.draft().unitSystem);

  private readonly reading = computed(() =>
    this.flow.draft().setupMethod === 'report' ? (this.report?.reading() ?? null) : null,
  );
  protected readonly note = computed(() => {
    const reading = this.reading();
    return reading ? reportNotesWithIcons(reading).height : null;
  });

  protected readonly height = signal<BodyHeight>(this.initialHeight());
  private dirty = false;
  private readonly picker = viewChild.required(HeightPickerComponent);

  constructor() {
    // Going back keeps a changed height.
    inject(DestroyRef).onDestroy(() => {
      if (this.dirty) {
        this.commit();
      }
    });
  }

  protected change(height: BodyHeight): void {
    this.dirty = true;
    this.height.set(height);
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
    this.flow.update({ basics: { ...this.flow.draft().basics, height: this.height() } });
    if (this.reading()) {
      this.report?.markConfirmed('height');
    }
  }

  private initialHeight(): BodyHeight {
    const reading = this.reading();
    const fromReport = reading && this.report?.isPrefillPending('height') ? reportPrefillValues(reading.prefill).height : undefined;
    return fromReport ?? this.flow.draft().basics.height ?? DEFAULT_HEIGHT;
  }
}
