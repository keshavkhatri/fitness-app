import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  linkedSignal,
  resource,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonTitle, IonToolbar, NavController } from '@ionic/angular';

import { BodyCompositionHistoryService } from '../../core/body-composition/body-composition-history.service';
import { MAX_REPORT_BYTES } from '../../core/inbody/inbody-extraction.client';
import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import {
  BODY_COMPOSITION_METRICS,
  BodyCompositionMetric,
  KEY_BODY_COMPOSITION_METRICS,
  METRIC_QUANTITY,
  validateBodyCompositionInput,
} from '../../domain/body-composition';
import { UnitSystem } from '../../domain/fitness-profile';
import { INBODY_REPORT_MEDIA_TYPES } from '../../domain/inbody-extraction';
import {
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  NoticeComponent,
  SegmentOption,
  SegmentedControlComponent,
  TextFieldComponent,
} from '../../shared/ui';
import { ReportImport } from '../onboarding/state/report-import.service';
import { REPORT_FAILURE_COPY, reportIssueText, reportReviewSummary } from '../onboarding/state/report-review';
import { BODY_COMPOSITION_COPY } from './body-composition-content';
import {
  BodyCompositionFormErrors,
  BodyCompositionFormValues,
  MassUnit,
  ReportPrefillNotes,
  bodyCompositionFormErrorsOf,
  defaultMassUnit,
  emptyBodyCompositionForm,
  formUnitOf,
  prefillBodyCompositionForm,
  readBodyCompositionForm,
  reviewedSource,
  unitLabelOf,
} from './body-composition-entry-view-model';
import { BODY_COMPOSITION_RETURN_PATH } from './body-composition-paths';

let nextId = 0;
const MIB = 1024 * 1024;
const isKeyMetric = (metric: BodyCompositionMetric) => (KEY_BODY_COMPOSITION_METRICS as readonly string[]).includes(metric);

const MASS_UNIT_OPTIONS: readonly SegmentOption<MassUnit>[] = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
];

type Loaded =
  /** `unitSystem` only picks the default mass unit (null without a readable profile). */
  | { readonly kind: 'new'; readonly unitSystem: UnitSystem | null }
  /** The store can't be read (corrupt or newer version): nothing can be saved. */
  | { readonly kind: 'error' };

/**
 * A new body-composition assessment: `/you/body-composition/new`. Values
 * from an InBody report, as printed, in the report's unit; any subset of the
 * supported metrics, at least one. The user can upload a report image to
 * have the form filled in (the onboarding ReportImport, held in memory
 * only): the filled-in form is the review step, and nothing is saved until
 * the user saves it. Saved as read from the report only when unchanged,
 * otherwise as a manual entry; to body composition only (never the profile
 * or weight history). Nothing is shown as saved until storage confirmed it.
 * Add-only: there is no editing.
 */
@Component({
  selector: 'app-body-composition-entry',
  templateUrl: './body-composition-entry.page.html',
  styleUrl: './body-composition-entry.page.scss',
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonFooter,
    IonIcon,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    NoticeComponent,
    SegmentedControlComponent,
    TextFieldComponent,
  ],
  providers: [ReportImport],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BodyCompositionEntryPage {
  private readonly history = inject(BodyCompositionHistoryService);
  private readonly profiles = inject(FitnessProfileService);
  private readonly nav = inject(NavController);
  protected readonly report = inject(ReportImport);

  protected readonly copy = BODY_COMPOSITION_COPY.form;
  protected readonly uploadCopy = BODY_COMPOSITION_COPY.upload;
  protected readonly metricLabels = BODY_COMPOSITION_COPY.metrics;
  protected readonly keyMetrics = BODY_COMPOSITION_METRICS.filter(isKeyMetric);
  protected readonly moreMetrics = BODY_COMPOSITION_METRICS.filter((metric) => !isKeyMetric(metric));
  protected readonly massUnitOptions = MASS_UNIT_OPTIONS;
  protected readonly returnPath = BODY_COMPOSITION_RETURN_PATH;
  protected readonly accept = INBODY_REPORT_MEDIA_TYPES.join(',');
  protected readonly maxMegabytes = MAX_REPORT_BYTES / MIB;
  protected readonly today = this.history.today();
  /** Linked from every value field while "enter at least one value" is shown. */
  protected readonly groupErrorId = `body-composition-values-error-${nextId++}`;
  protected readonly massUnitName = `body-composition-mass-unit-${nextId++}`;

  private readonly state = resource({
    loader: async (): Promise<Loaded> => {
      const [, unitSystem] = await Promise.all([
        this.history.state().status === 'ready' ? undefined : this.history.load(),
        this.profiles.load().then(
          (profile) => profile?.unitSystem ?? null,
          () => null,
        ),
      ]);
      return this.history.state().status === 'ready' ? { kind: 'new', unitSystem } : { kind: 'error' };
    },
  });

  /** null while loading. */
  protected readonly loaded = computed<Loaded | null>(() => (this.state.hasValue() ? this.state.value() : this.state.error() ? { kind: 'error' } : null));

  protected readonly form = linkedSignal<BodyCompositionFormValues>(() => {
    const l = this.loaded();
    return emptyBodyCompositionForm(this.today, defaultMassUnit(l?.kind === 'new' ? l.unitSystem : null));
  });
  protected readonly errors = signal<BodyCompositionFormErrors>({});
  protected readonly saving = signal(false);
  /** Announced above Save: validation summary or a failed save. */
  protected readonly status = signal('');

  /** The form as filled in from the report, before any correction; null for typed-in entries. */
  private readonly prefilledForm = signal<BodyCompositionFormValues | null>(null);
  protected readonly prefillNotes = signal<ReportPrefillNotes>({});
  protected readonly reviewMessage = signal<string | null>(null);
  protected readonly reviewWarnings = computed(() => {
    const reading = this.report.reading();
    return reading ? reportReviewSummary(reading).warnings : [];
  });
  /** "More report values" starts open when the report filled any of them. */
  protected readonly moreOpen = computed(() => this.moreMetrics.some((metric) => this.prefillNotes()[metric]));
  /** Kept open while one of its fields shows an error, so the error can be seen and focused. */
  protected readonly hasMoreError = computed(() => this.moreMetrics.some((metric) => this.errors()[metric]));

  protected readonly reportState = this.report.current;
  protected readonly reportFile = computed(() => {
    const state = this.reportState();
    return state.status === 'selected' || state.status === 'reading' || state.status === 'failed' ? state.file : null;
  });
  protected readonly reportFailure = computed(() => {
    const state = this.reportState();
    return state.status === 'failed' ? { ...REPORT_FAILURE_COPY[state.failure], issues: reportIssueText(state.reportIssues) } : null;
  });

  private readonly fields = viewChildren(TextFieldComponent);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  constructor() {
    // A successful read fills in the form for review (once per reading).
    effect(() => {
      const reading = this.report.reading();
      if (!reading) {
        return;
      }
      untracked(() => {
        const { form, notes, filled, toCheck } = prefillBodyCompositionForm(reading.prefill, this.today, this.form().massUnit);
        this.form.set(form);
        this.prefilledForm.set(form);
        this.prefillNotes.set(notes);
        this.errors.set({});
        this.status.set('');
        this.reviewMessage.set(this.uploadCopy.review.message(filled, toCheck));
      });
    });
  }

  protected unitFor(metric: BodyCompositionMetric): string {
    return unitLabelOf(formUnitOf(metric, this.form().massUnit));
  }

  protected noteFor(metric: BodyCompositionMetric): string | undefined {
    return this.prefillNotes()[metric] === 'check' ? this.uploadCopy.review.check : undefined;
  }

  protected chooseImage(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected onImageChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared so choosing the same file again still counts as a choice.
    input.value = '';
    if (file) {
      this.report.choose(file);
      void this.report.read();
    }
  }

  protected retryRead(): void {
    void this.report.read();
  }

  protected fileSize(file: File): string {
    return file.size >= MIB ? `${(file.size / MIB).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
  }

  protected update(field: BodyCompositionMetric | 'date', value: string): void {
    this.form.update((f) => ({ ...f, [field]: value }));
    // Filling in any value also clears "enter at least one value".
    const clearsGroup = field !== 'date' && value.trim() !== '';
    if (this.errors()[field] || (clearsGroup && this.errors().values)) {
      this.errors.update(({ [field]: _, values, ...rest }) => (clearsGroup || !values ? rest : { ...rest, values }));
    }
  }

  protected setMassUnit(massUnit: MassUnit): void {
    this.form.update((f) => ({ ...f, massUnit }));
    // Range messages name the unit, so they are stale once it changes.
    this.errors.update((errors) =>
      Object.fromEntries(Object.entries(errors).filter(([field]) => METRIC_QUANTITY[field as BodyCompositionMetric] !== 'mass')),
    );
  }

  protected async save(): Promise<void> {
    if (this.saving() || this.loaded()?.kind !== 'new') {
      return; // no double submit
    }
    const form = this.form();
    const { input, formatErrors } = readBodyCompositionForm(form, reviewedSource(form, this.prefilledForm()));
    if (Object.keys(formatErrors).length > 0) {
      // Never sent for saving while a number is ambiguous.
      this.showErrors(bodyCompositionFormErrorsOf(validateBodyCompositionInput(input, this.history.today()), form.massUnit, formatErrors));
      return;
    }
    this.saving.set(true);
    this.status.set('');
    try {
      const result = await this.history.add(input);
      if (result.ok) {
        this.errors.set({});
        this.report.reset();
        void this.nav.navigateBack(BODY_COMPOSITION_RETURN_PATH);
      } else if (result.kind === 'invalid') {
        this.showErrors(bodyCompositionFormErrorsOf(result.errors, form.massUnit));
      } else {
        this.status.set(this.copy.saveFailed);
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    if (!this.saving()) {
      void this.nav.navigateBack(BODY_COMPOSITION_RETURN_PATH);
    }
  }

  protected retry(): void {
    this.state.reload();
  }

  private showErrors(errors: BodyCompositionFormErrors): void {
    this.errors.set(errors);
    this.status.set(this.copy.fixErrors);
    // Fields are rendered key metrics first, then the other metrics, then date.
    const order: (BodyCompositionMetric | 'date')[] = [...this.keyMetrics, ...this.moreMetrics, 'date'];
    const first = errors.values ? 0 : order.findIndex((field) => errors[field]);
    if (first >= 0) {
      this.fields()[first]?.focus();
    }
  }
}
