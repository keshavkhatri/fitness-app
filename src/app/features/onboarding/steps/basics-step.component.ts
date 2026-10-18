import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { CLOCK, localIsoDate } from '../../../core/time/clock';
import { ChoiceGroupComponent, NoticeComponent, TextFieldComponent } from '../../../shared/ui';
import { SEX_CARD_OPTIONS } from '../onboarding-content';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { ReportImport } from '../state/report-import.service';
import { reportReviewSummary, reportPrefillValues } from '../state/report-review';
import {
  AboutErrors,
  AboutField,
  AboutFormInput,
  aboutFormFromDraft,
  validateAboutForm,
  validateBirthDateInput,
} from '../validation/onboarding-validation';
import { OnboardingStepForm, STEP_HEADING_ID } from './onboarding-step-form';
import { reportNotesWithIcons } from './report-notes';

const FIELD_ORDER: readonly AboutField[] = ['sex', 'dateOfBirth'];

/**
 * About you: sex and date of birth. Height and weight follow on their own
 * screens. The name isn't asked here: it comes from the account created after
 * the questionnaire (and can be changed in You).
 *
 * When the user set up from an InBody report, this is also where its
 * summary is shown, and sex starts from the report until confirmed here.
 */
@Component({
  selector: 'app-basics-step',
  templateUrl: './basics-step.component.html',
  styleUrl: './basics-step.component.scss',
  imports: [IonIcon, ChoiceGroupComponent, NoticeComponent, TextFieldComponent],
  providers: [{ provide: OnboardingStepForm, useExisting: BasicsStepComponent }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BasicsStepComponent implements OnboardingStepForm {
  private readonly flow = inject(OnboardingFlow);
  private readonly report = inject(ReportImport, { optional: true });
  private readonly clock = inject(CLOCK);

  protected readonly headingId = STEP_HEADING_ID;
  protected readonly sexOptions = SEX_CARD_OPTIONS;
  /** Latest date the picker offers. */
  protected readonly today = computed(() => localIsoDate(this.clock()));

  /** The InBody report being reviewed, when the user set up from one and it was read. */
  private readonly reading = computed(() =>
    this.flow.draft().setupMethod === 'report' ? (this.report?.reading() ?? null) : null,
  );
  protected readonly reportNotes = computed(() => {
    const reading = this.reading();
    return reading ? reportNotesWithIcons(reading) : null;
  });
  protected readonly reportSummary = computed(() => {
    const reading = this.reading();
    return reading ? reportReviewSummary(reading) : null;
  });

  /** Raw form state; committed to the flow once valid (or, field by field, on leaving). */
  protected readonly form = signal<AboutFormInput>(this.initialForm());
  private readonly submitted = signal(false);
  private dirty = false;

  /** Errors appear after the first Continue, then update live as the user fixes them. */
  protected readonly errors = computed<AboutErrors>(() => {
    if (!this.submitted()) {
      return {};
    }
    const result = validateAboutForm(this.form(), this.clock());
    return result.ok ? {} : result.errors;
  });

  protected readonly selectedSex = computed(() => {
    const sex = this.form().sex;
    return sex ? [sex] : [];
  });

  private readonly sexGroup = viewChild.required(ChoiceGroupComponent);
  private readonly birthDateField = viewChild.required<TextFieldComponent>('birthDateField');

  constructor() {
    // Going back keeps what was answered here (each valid answer on its own).
    inject(DestroyRef).onDestroy(() => this.keepValidAnswers());
  }

  protected patch(change: Partial<AboutFormInput>): void {
    this.dirty = true;
    this.form.update((form) => ({ ...form, ...change }));
  }

  submit(): boolean {
    this.submitted.set(true);
    const result = validateAboutForm(this.form(), this.clock());
    if (!result.ok) {
      this.focusField(FIELD_ORDER.find((field) => result.errors[field]) ?? 'sex');
      return false;
    }
    const { dateOfBirth, sex } = result.value;
    this.flow.update({ basics: { ...this.flow.draft().basics, dateOfBirth, sex } });
    this.confirmReport();
    this.dirty = false;
    return true;
  }

  /** Describes the sex group: its hint or error, and its report note. */
  protected describedBy(field: 'sex', other: string): string {
    return this.reportNotes() ? `${other} ${field}-report-note` : other;
  }

  private keepValidAnswers(): void {
    if (!this.dirty) {
      return;
    }
    const form = this.form();
    const dob = validateBirthDateInput(form.birthDate, this.clock());
    const basics = this.flow.draft().basics;
    this.flow.update({
      basics: { ...basics, sex: form.sex ?? basics.sex, dateOfBirth: dob.ok ? dob.value : basics.dateOfBirth },
    });
    if (form.sex) {
      this.confirmReport();
    }
  }

  private confirmReport(): void {
    if (this.reading()) {
      this.report?.markConfirmed('sex');
    }
  }

  private initialForm(): AboutFormInput {
    const form = aboutFormFromDraft(this.flow.draft());
    const reading = this.reading();
    const reportSex = reading && this.report?.isPrefillPending('sex') ? reportPrefillValues(reading.prefill).sex : undefined;
    return reportSex ? { ...form, sex: reportSex } : form;
  }

  private focusField(field: AboutField): void {
    const targets: Record<AboutField, { focus(): void }> = {
      sex: this.sexGroup(),
      dateOfBirth: this.birthDateField(),
    };
    targets[field].focus();
  }
}
