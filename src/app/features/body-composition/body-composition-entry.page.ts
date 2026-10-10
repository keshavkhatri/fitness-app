import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, resource, signal, viewChildren } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonFooter, IonHeader, IonTitle, IonToolbar, NavController } from '@ionic/angular';

import { BodyCompositionHistoryService } from '../../core/body-composition/body-composition-history.service';
import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import { BODY_COMPOSITION_METRICS, BodyCompositionMetric, METRIC_QUANTITY, validateBodyCompositionInput } from '../../domain/body-composition';
import { UnitSystem } from '../../domain/fitness-profile';
import {
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  SegmentOption,
  SegmentedControlComponent,
  TextFieldComponent,
} from '../../shared/ui';
import { BODY_COMPOSITION_COPY } from './body-composition-content';
import {
  BodyCompositionFormErrors,
  BodyCompositionFormValues,
  MassUnit,
  bodyCompositionFormErrorsOf,
  defaultMassUnit,
  emptyBodyCompositionForm,
  readBodyCompositionForm,
} from './body-composition-entry-view-model';
import { BODY_COMPOSITION_RETURN_PATH } from './body-composition-paths';

let nextId = 0;

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
 * Manual entry of one body-composition assessment: `/you/body-composition/new`.
 * Values typed from an InBody report, as printed, in the report's unit; any
 * subset of the supported metrics, at least one. Always saved as a manual
 * entry (never as an import), to body composition only; nothing is shown as
 * saved until storage confirmed it. Add-only: there is no editing.
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
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    SegmentedControlComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BodyCompositionEntryPage {
  private readonly history = inject(BodyCompositionHistoryService);
  private readonly profiles = inject(FitnessProfileService);
  private readonly nav = inject(NavController);

  protected readonly copy = BODY_COMPOSITION_COPY.form;
  protected readonly metricLabels = BODY_COMPOSITION_COPY.metrics;
  protected readonly metrics = BODY_COMPOSITION_METRICS;
  protected readonly massUnitOptions = MASS_UNIT_OPTIONS;
  protected readonly returnPath = BODY_COMPOSITION_RETURN_PATH;
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

  private readonly fields = viewChildren(TextFieldComponent);

  protected unitFor(metric: BodyCompositionMetric): string {
    return METRIC_QUANTITY[metric] === 'percentage' ? '%' : this.form().massUnit;
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
    this.errors.update(({ weight: _w, 'body-fat-mass': _f, 'lean-body-mass': _l, ...rest }) => rest);
  }

  protected async save(): Promise<void> {
    if (this.saving() || this.loaded()?.kind !== 'new') {
      return; // no double submit
    }
    const form = this.form();
    const { input, formatErrors } = readBodyCompositionForm(form);
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
    // Fields are rendered in metric order, then date.
    const order: (BodyCompositionMetric | 'date')[] = [...BODY_COMPOSITION_METRICS, 'date'];
    const first = errors.values ? 0 : order.findIndex((field) => errors[field]);
    if (first >= 0) {
      this.fields()[first]?.focus();
    }
  }
}
