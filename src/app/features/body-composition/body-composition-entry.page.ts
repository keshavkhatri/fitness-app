import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { IonContent, IonFooter, IonIcon, NavController } from '@ionic/angular';

import { BodyCompositionHistoryService } from '../../core/body-composition/body-composition-history.service';
import { MAX_REPORT_BYTES } from '../../core/inbody/inbody-extraction.client';
import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import { ThemeService } from '../../core/theme/theme.service';
import {
  BODY_COMPOSITION_METRICS,
  BodyCompositionAssessment,
  BodyCompositionMetric,
  KEY_BODY_COMPOSITION_METRICS,
  ReportedValue,
  METRIC_QUANTITY,
  validateBodyCompositionInput,
} from '../../domain/body-composition';
import { UnitSystem } from '../../domain/fitness-profile';
import { INBODY_AI_PROVENANCE, INBODY_REPORT_MEDIA_TYPES } from '../../domain/inbody-extraction';
import {
  AnalysisOverlayComponent,
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  NoticeComponent,
  SegmentOption,
  SegmentedControlComponent,
  TextFieldComponent,
} from '../../shared/ui';
import { ReportThumbComponent } from './components/report-thumb.component';
import { ReportImport } from '../onboarding/state/report-import.service';
import { REPORT_FAILURE_COPY, reportIssueText, reportReviewSummary } from '../onboarding/state/report-review';
import { BODY_COMPOSITION_COPY } from './body-composition-content';
import { formatReportedValue, shortDateOf } from './body-composition-history-view-model';
import { EarlierSaved, ReportResults, WeighInItem } from './report-results.service';
import {
  BodyCompositionFormErrors,
  BodyCompositionFormValues,
  MassUnit,
  ReportPrefillNotes,
  bodyCompositionFormErrorsOf,
  bodyCompositionFormOf,
  defaultMassUnit,
  editedSource,
  emptyBodyCompositionForm,
  formUnitOf,
  prefillBodyCompositionForm,
  readBodyCompositionForm,
  reviewedSource,
  unitLabelOf,
} from './body-composition-entry-view-model';
import { BODY_COMPOSITION_RETURN_PATH, bodyCompositionDetailPath } from './body-composition-paths';

let nextId = 0;
const MIB = 1024 * 1024;
const isKeyMetric = (metric: BodyCompositionMetric) => (KEY_BODY_COMPOSITION_METRICS as readonly string[]).includes(metric);

const MASS_UNIT_OPTIONS: readonly SegmentOption<MassUnit>[] = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
];

const SHOWN_IN_SUMMARY: readonly BodyCompositionMetric[] = ['weight', 'skeletal-muscle-mass', 'body-fat-percentage'];
/** How many saved values a one-line summary doesn't name. */
const moreCount = (values: Readonly<Partial<Record<BodyCompositionMetric, unknown>>>): number =>
  Object.keys(values).filter((metric) => !SHOWN_IN_SUMMARY.includes(metric as BodyCompositionMetric)).length;

/** An earlier test from the report's history chart, offered for adding to the history. */
interface EarlierChoice {
  readonly date: string;
  /** "Mar 14" */
  readonly label: string;
  /** "71.9 kg · 25.4 kg muscle · 33.6% body fat" */
  readonly summary: string;
  readonly needsReview: boolean;
  /** An assessment for this date exists already: never added a second time. */
  readonly alreadySaved: boolean;
  readonly selected: boolean;
}

type Loaded =
  /** `unitSystem` only picks the default mass unit (null without a readable profile). */
  | { readonly kind: 'new'; readonly unitSystem: UnitSystem | null }
  /** Correcting a saved assessment (no report upload). */
  | { readonly kind: 'edit'; readonly unitSystem: UnitSystem | null; readonly assessment: BodyCompositionAssessment }
  | { readonly kind: 'not-found' }
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
 *
 * Also edits a saved assessment: `/you/body-composition/:assessmentId/edit`,
 * prefilled with every saved value. An imported assessment keeps its
 * provenance only while its values are unchanged; nothing else (profile,
 * weigh-ins) is ever touched.
 */
@Component({
  selector: 'app-body-composition-entry',
  templateUrl: './body-composition-entry.page.html',
  styleUrl: './body-composition-entry.page.scss',
  host: { class: 'fit-theme-immersive fit-tracking-form' },
  imports: [
    AnalysisOverlayComponent,
    IonContent,
    ReportThumbComponent,
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
  /** Route parameter; absent when adding. */
  readonly assessmentId = input<string>();

  private readonly history = inject(BodyCompositionHistoryService);
  private readonly results = inject(ReportResults);
  private readonly profiles = inject(FitnessProfileService);
  private readonly nav = inject(NavController);
  protected readonly report = inject(ReportImport);

  protected readonly copy = BODY_COMPOSITION_COPY.form;
  protected readonly uploadCopy = BODY_COMPOSITION_COPY.upload;
  protected readonly analysisCopy = BODY_COMPOSITION_COPY.upload.analysis;
  protected readonly historyCopy = BODY_COMPOSITION_COPY.upload.history;
  protected readonly metricLabels = BODY_COMPOSITION_COPY.metrics;
  protected readonly keyMetrics = BODY_COMPOSITION_METRICS.filter(isKeyMetric);
  protected readonly moreMetrics = BODY_COMPOSITION_METRICS.filter((metric) => !isKeyMetric(metric));
  protected readonly massUnitOptions = MASS_UNIT_OPTIONS;
  protected readonly returnPath = computed(() => {
    const id = this.assessmentId();
    return id ? bodyCompositionDetailPath(id).join('/').slice(1) : BODY_COMPOSITION_RETURN_PATH;
  });
  protected readonly accept = INBODY_REPORT_MEDIA_TYPES.join(',');
  protected readonly maxMegabytes = MAX_REPORT_BYTES / MIB;
  protected readonly today = this.history.today();
  /** Linked from every value field while "enter at least one value" is shown. */
  protected readonly groupErrorId = `body-composition-values-error-${nextId++}`;
  protected readonly massUnitName = `body-composition-mass-unit-${nextId++}`;

  private readonly state = resource({
    params: () => ({ id: this.assessmentId() }),
    loader: async ({ params }): Promise<Loaded> => {
      const [, unitSystem] = await Promise.all([
        this.history.state().status === 'ready' ? undefined : this.history.load(),
        this.profiles.load().then(
          (profile) => profile?.unitSystem ?? null,
          () => null,
        ),
      ]);
      const s = this.history.state();
      if (s.status !== 'ready') {
        return { kind: 'error' };
      }
      if (!params.id) {
        return { kind: 'new', unitSystem };
      }
      const assessment = s.assessments.find((a) => a.id === params.id);
      return assessment ? { kind: 'edit', unitSystem, assessment } : { kind: 'not-found' };
    },
  });

  /** null while loading. */
  protected readonly loaded = computed<Loaded | null>(() => (this.state.hasValue() ? this.state.value() : this.state.error() ? { kind: 'error' } : null));
  /** The form can be filled in (adding or editing). */
  protected readonly editable = computed(() => {
    const kind = this.loaded()?.kind;
    return kind === 'new' || kind === 'edit';
  });
  protected readonly editing = computed(() => this.loaded()?.kind === 'edit');
  /** The values form has been opened: by choosing manual entry, or by a report being read. Stays open once it is. */
  private readonly manualOpen = signal(false);
  /**
   * The values form: always when correcting a saved assessment or when reports can't be uploaded; otherwise only
   * once the user chooses manual entry, or a report has been read and its values are there to review.
   */
  protected readonly formVisible = computed(() => this.editing() || !this.report.available || this.manualOpen());
  protected readonly title = computed(() => (this.assessmentId() ? this.copy.editTitle : this.copy.title));
  /** The saved assessment as the form shows it; null when adding. */
  private readonly savedForm = computed(() => {
    const l = this.loaded();
    return l?.kind === 'edit' ? bodyCompositionFormOf(l.assessment, defaultMassUnit(l.unitSystem)) : null;
  });
  protected readonly imported = computed(() => {
    const l = this.loaded();
    return l?.kind === 'edit' && l.assessment.source.entryMethod === 'import';
  });

  protected readonly form = linkedSignal<BodyCompositionFormValues>(() => {
    const l = this.loaded();
    const saved = this.savedForm();
    if (saved) {
      return saved;
    }
    return emptyBodyCompositionForm(this.today, defaultMassUnit(l?.kind === 'new' ? l.unitSystem : null));
  });
  protected readonly errors = signal<BodyCompositionFormErrors>({});
  protected readonly saving = signal(false);
  /** Saved and leaving: a second tap (e.g. a double click) can't save again. */
  protected readonly saved = signal(false);
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
  protected readonly moreOpen = computed(() => {
    const saved = this.savedForm();
    return this.moreMetrics.some((metric) => this.prefillNotes()[metric] || (saved && saved[metric] !== ''));
  });
  /** Kept open while one of its fields shows an error, so the error can be seen and focused. */
  protected readonly hasMoreError = computed(() => this.moreMetrics.some((metric) => this.errors()[metric]));

  /** Dates of the earlier results the user has switched off (every new reading starts with all on). */
  private readonly skippedEarlier = signal<ReadonlySet<string>>(new Set());
  /** The earlier tests the report's history chart lists, as choices to add to the history. */
  protected readonly historyChoices = computed<readonly EarlierChoice[]>(() => {
    const suggestions = this.report.reading()?.prefill.history ?? [];
    const state = this.history.state();
    const saved = new Set(state.status === 'ready' ? state.assessments.map((a) => a.date) : []);
    return suggestions.map((s) => {
      const alreadySaved = saved.has(s.date);
      return {
        date: s.date,
        label: shortDateOf(s.date, this.today),
        summary: [
          s.values.weight && formatReportedValue(s.values.weight),
          s.values['skeletal-muscle-mass'] && `${formatReportedValue(s.values['skeletal-muscle-mass'])} muscle`,
          s.values['body-fat-percentage'] && `${formatReportedValue(s.values['body-fat-percentage'])} body fat`,
          // The rest of what the chart printed for that day is added too.
          moreCount(s.values) > 0 && `+${moreCount(s.values)} more`,
        ]
          .filter(Boolean)
          .join(' · '),
        needsReview: s.needsReview,
        alreadySaved,
        selected: !alreadySaved && !this.skippedEarlier().has(s.date),
      };
    });
  });

  protected readonly reportState = this.report.current;
  /** The user wants to pick another image although one has been read. */
  protected readonly changeImage = signal(false);
  /** Show the fields the report didn't have too (after a read, only the captured ones are shown). */
  protected readonly showAllFields = signal(false);
  /** Also add each weight to the weight history (weigh-ins), on its date. */
  protected readonly logWeights = signal(true);
  /** A report was read and the picker steps aside for its results. */
  protected readonly summaryMode = computed(() => this.reportState().status === 'read' && !this.changeImage());
  protected readonly pickerOpen = computed(() => this.reportState().status !== 'read' || this.changeImage());
  /** The metrics the report gave a value for, in the form's order. */
  protected readonly capturedMetrics = computed<readonly BodyCompositionMetric[]>(() => {
    const prefilled = this.prefilledForm();
    return prefilled ? BODY_COMPOSITION_METRICS.filter((metric) => prefilled[metric] !== '') : [];
  });
  /** After a read: only the captured values (until the user asks for the rest). */
  protected readonly onlyCaptured = computed(() => this.prefilledForm() !== null && !this.showAllFields() && this.capturedMetrics().length > 0);
  /** The fields on screen: the key ones, then the rest in "More report values" (after a read, only what was captured). */
  protected readonly shownKeyMetrics = computed(() =>
    this.onlyCaptured() ? this.capturedMetrics().filter(isKeyMetric) : this.keyMetrics,
  );
  protected readonly shownMoreMetrics = computed(() =>
    this.onlyCaptured() ? this.capturedMetrics().filter((metric) => !isKeyMetric(metric)) : this.moreMetrics,
  );
  /** The value fields in the order they are on screen (date last). */
  private readonly renderedMetrics = computed<readonly BodyCompositionMetric[]>(() => [...this.shownKeyMetrics(), ...this.shownMoreMetrics()]);
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
  private readonly cameraInput = viewChild<ElementRef<HTMLInputElement>>('cameraInput');
  // Light status-bar text while this always-dark form is open.
  private readonly statusBar = inject(DestroyRef).onDestroy(inject(ThemeService).holdAlwaysDark());

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
        this.skippedEarlier.set(new Set());
        // Shown for review, and kept open after (saving forgets the reading, but the form must not vanish before the page leaves).
        this.manualOpen.set(true);
        this.changeImage.set(false);
        this.showAllFields.set(false);
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

  /** The device camera where supported (the same image upload; otherwise the browser offers files). */
  protected takePhoto(): void {
    this.cameraInput()?.nativeElement.click();
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

  protected openManualEntry(): void {
    this.manualOpen.set(true);
  }

  /** Leaves the full-screen wait: the reading is abandoned (a late answer is dropped). */
  protected cancelReading(): void {
    this.report.reset();
  }

  protected toggleEarlier(date: string): void {
    this.skippedEarlier.update((skipped) => {
      const next = new Set(skipped);
      if (!next.delete(date)) {
        next.add(date);
      }
      return next;
    });
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
    const l = this.loaded();
    if (this.saving() || this.saved() || !l || (l.kind !== 'new' && l.kind !== 'edit')) {
      return; // no double submit, while saving or after
    }
    const form = this.form();
    const saved = this.savedForm();
    const source = l.kind === 'edit' && saved ? editedSource(form, saved, l.assessment.source) : reviewedSource(form, this.prefilledForm());
    const { input, formatErrors } = readBodyCompositionForm(form, source);
    if (Object.keys(formatErrors).length > 0) {
      // Never sent for saving while a number is ambiguous.
      this.showErrors(bodyCompositionFormErrorsOf(validateBodyCompositionInput(input, this.history.today()), form.massUnit, formatErrors));
      return;
    }
    this.saving.set(true);
    this.status.set('');
    try {
      const result = l.kind === 'edit' ? await this.history.update(l.assessment, input) : await this.history.add(input);
      if (result.ok) {
        this.saved.set(true);
        this.errors.set({});
        // The earlier tests from the report's history chart, once the main assessment is safely saved.
        const earlier = l.kind === 'new' ? await this.saveEarlier() : { total: 0, saved: [] as readonly EarlierSaved[] };
        // The weights (this assessment's and the earlier tests') as weigh-ins on their dates.
        const weighIns =
          l.kind === 'new' && this.logWeights()
            ? await this.logWeightEntries([
                { date: input.date, weight: input.values.weight },
                ...earlier.saved.map((s) => ({ date: s.date, weight: s.values.weight })),
              ])
            : { failed: 0 };
        this.report.reset();
        if (earlier.saved.length < earlier.total || weighIns.failed > 0) {
          // Stay: the assessment itself is saved, so Save is off and the message explains the rest.
          this.status.set(
            [
              earlier.saved.length < earlier.total ? this.historyCopy.partlyFailed(earlier.saved.length, earlier.total) : '',
              weighIns.failed > 0 ? this.copy.weightsNotLogged(weighIns.failed) : '',
            ]
              .filter(Boolean)
              .join(' '),
          );
          return;
        }
        void this.nav.navigateBack(l.kind === 'edit' ? bodyCompositionDetailPath(l.assessment.id) : BODY_COMPOSITION_RETURN_PATH);
      } else if (result.kind === 'invalid') {
        this.showErrors(bodyCompositionFormErrorsOf(result.errors, form.massUnit));
      } else {
        this.status.set(this.copy.saveFailed);
      }
    } finally {
      this.saving.set(false);
    }
  }

  /** Adds each chosen earlier test as its own assessment, as read from the report. */
  /** Adds each chosen earlier test as its own assessment, as read from the report. */
  private saveEarlier(): Promise<{ readonly total: number; readonly saved: readonly EarlierSaved[] }> {
    const chosen = new Set(this.historyChoices().filter((choice) => choice.selected).map((choice) => choice.date));
    return this.results.addEarlier((this.report.reading()?.prefill.history ?? []).filter((s) => chosen.has(s.date)));
  }

  private logWeightEntries(items: readonly WeighInItem[]): Promise<{ readonly failed: number }> {
    return this.results.logWeights(items);
  }

  protected cancel(): void {
    if (!this.saving()) {
      void this.nav.navigateBack(this.backPath());
    }
  }

  /** Editing returns to the assessment; adding to the history. */
  private backPath(): string | string[] {
    const id = this.assessmentId();
    return id ? bodyCompositionDetailPath(id) : BODY_COMPOSITION_RETURN_PATH;
  }

  protected backToHistory(): void {
    void this.nav.navigateBack(BODY_COMPOSITION_RETURN_PATH);
  }

  protected retry(): void {
    this.state.reload();
  }

  private showErrors(errors: BodyCompositionFormErrors): void {
    this.errors.set(errors);
    this.status.set(this.copy.fixErrors);
    // Fields are rendered key metrics first, then the other metrics, then date.
    const order: (BodyCompositionMetric | 'date')[] = [...this.renderedMetrics(), 'date'];
    const first = errors.values ? 0 : order.findIndex((field) => errors[field]);
    if (first >= 0) {
      this.fields()[first]?.focus();
    }
  }
}
