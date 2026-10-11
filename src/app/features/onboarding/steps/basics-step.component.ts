import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { IonIcon } from '@ionic/angular';

import { Sex, UnitSystem, weightUnitLabel } from '../../../domain/fitness-profile';
import { ChoiceGroupComponent, NoticeComponent, SegmentedControlComponent, TextFieldComponent } from '../../../shared/ui';
import { SEX_OPTIONS, UNIT_SYSTEM_OPTIONS } from '../onboarding-content';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { ReportImport } from '../state/report-import.service';
import { ReportNoteTone, applyReportPrefill, reportFieldNotes, reportReviewSummary } from '../state/report-review';
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

const NOTE_ICONS: Readonly<Record<ReportNoteTone, string>> = {
  read: 'checkmark-circle',
  check: 'warning-outline',
  missing: 'information-circle-outline',
};

@Component({
  selector: 'app-basics-step',
  templateUrl: './basics-step.component.html',
  styleUrl: './basics-step.component.scss',
  imports: [IonIcon, NgTemplateOutlet, ChoiceGroupComponent, NoticeComponent, SegmentedControlComponent, TextFieldComponent],
  providers: [{ provide: OnboardingStepForm, useExisting: BasicsStepComponent }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BasicsStepComponent implements OnboardingStepForm {
  private readonly flow = inject(OnboardingFlow);
  private readonly report = inject(ReportImport, { optional: true });

  protected readonly headingId = STEP_HEADING_ID;
  protected readonly sexOptions = SEX_OPTIONS;
  protected readonly unitOptions = UNIT_SYSTEM_OPTIONS;

  /**
   * The InBody report being reviewed, when the user chose to set up from one
   * and it was read: this step is then where they check and correct it.
   */
  private readonly reading = computed(() =>
    this.flow.draft().setupMethod === 'report' ? (this.report?.reading() ?? null) : null,
  );
  protected readonly reportNotes = computed(() => {
    const reading = this.reading();
    if (!reading) {
      return null;
    }
    const notes = reportFieldNotes(reading);
    const withIcon = (field: BasicsField) => ({ ...notes[field], icon: NOTE_ICONS[notes[field].tone] });
    return { dateOfBirth: withIcon('dateOfBirth'), sex: withIcon('sex'), height: withIcon('height'), weight: withIcon('weight') };
  });
  protected readonly reportSummary = computed(() => {
    const reading = this.reading();
    return reading ? reportReviewSummary(reading) : null;
  });

  /**
   * Raw form state; committed to the flow only once valid. A newly read
   * report fills it in until the user confirms it with Continue.
   */
  protected readonly form = signal<BasicsFormInput>(this.initialForm());
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
      if (this.reading()) {
        this.report?.markBasicsConfirmed();
      }
      return true;
    }
    this.focusField(FIELD_ORDER.find((field) => result.errors[field]) ?? 'dateOfBirth');
    return false;
  }

  /** Ids describing a field: its report note (when reviewing a report) and `others`. */
  protected describedBy(field: BasicsField, ...others: (string | null)[]): string | null {
    const ids = [...others, this.reportNotes() ? `${field}-report-note` : null].filter(Boolean);
    return ids.length ? ids.join(' ') : null;
  }

  private initialForm(): BasicsFormInput {
    const form = basicsFormFromDraft(this.flow.draft());
    const reading = this.reading();
    return reading && this.report?.basicsPrefillPending() ? applyReportPrefill(form, reading.prefill) : form;
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
