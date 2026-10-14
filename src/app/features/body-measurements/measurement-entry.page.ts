import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, linkedSignal, resource, signal, viewChildren } from '@angular/core';
import { IonContent, IonFooter, IonIcon, NavController } from '@ionic/angular';

import { ThemeService } from '../../core/theme/theme.service';

import { MeasurementHistoryService } from '../../core/body-measurements/measurement-history.service';
import { MEASUREMENT_SITES, MeasurementEntry, MeasurementSite, lengthUnitLabel, validateMeasurementEntryInput } from '../../domain/body-measurements';
import { UnitSystem } from '../../domain/fitness-profile';
import { EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent, TextFieldComponent } from '../../shared/ui';
import { MEASUREMENT_COPY } from './measurement-content';
import {
  MeasurementFormErrors,
  MeasurementFormValues,
  emptyMeasurementForm,
  measurementFormErrorsOf,
  measurementFormOf,
  readMeasurementForm,
} from './measurement-entry-view-model';
import { MEASUREMENT_RETURN_PATH } from './measurement-paths';

let nextId = 0;

type Loaded =
  | { readonly kind: 'new'; readonly unitSystem: UnitSystem }
  | { readonly kind: 'edit'; readonly unitSystem: UnitSystem; readonly entry: MeasurementEntry }
  | { readonly kind: 'not-found' }
  /** Stored, but not readable by this version (e.g. unknown sites): shown as such and left untouched. */
  | { readonly kind: 'unsupported' }
  /** The store can't be read (corrupt or newer version): nothing can be saved. */
  | { readonly kind: 'error' };

/**
 * Add or edit one measuring occasion: `/you/measurements/new` or `/you/measurements/:entryId`.
 * Any subset of the sites, at least one. Saves to the measurement history
 * only; nothing is shown as saved until storage confirmed it.
 */
@Component({
  selector: 'app-measurement-entry',
  templateUrl: './measurement-entry.page.html',
  styleUrl: './measurement-entry.page.scss',
  host: { class: 'fit-theme-immersive fit-tracking-form' },
  imports: [
    IonContent,
    IonFooter,
    IonIcon,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MeasurementEntryPage {
  /** Route parameter; absent when adding. */
  readonly entryId = input<string>();

  private readonly history = inject(MeasurementHistoryService);
  private readonly nav = inject(NavController);

  protected readonly copy = MEASUREMENT_COPY.form;
  // Light status-bar text while this always-dark form is open.
  private readonly statusBar = inject(DestroyRef).onDestroy(inject(ThemeService).holdAlwaysDark());
  protected readonly siteLabels = MEASUREMENT_COPY.sites;
  protected readonly sites = MEASUREMENT_SITES;
  protected readonly returnPath = MEASUREMENT_RETURN_PATH;
  protected readonly today = this.history.today();
  /** Linked from every site field while "enter at least one measurement" is shown. */
  protected readonly groupErrorId = `measurement-values-error-${nextId++}`;

  private readonly state = resource({
    params: () => ({ id: this.entryId() }),
    loader: async ({ params }): Promise<Loaded> => {
      if (this.history.state().status !== 'ready') {
        await this.history.load();
      }
      const s = this.history.state();
      if (s.status !== 'ready') {
        return { kind: 'error' };
      }
      if (!params.id) {
        return { kind: 'new', unitSystem: s.unitSystem };
      }
      const entry = s.entries.find((e) => e.id === params.id);
      if (entry) {
        return { kind: 'edit', unitSystem: s.unitSystem, entry };
      }
      // Rejects (→ error state) if the store became unreadable meanwhile.
      return (await this.history.isUnsupportedEntry(params.id)) ? { kind: 'unsupported' } : { kind: 'not-found' };
    },
  });

  /** null while loading. */
  protected readonly loaded = computed<Loaded | null>(() => (this.state.hasValue() ? this.state.value() : this.state.error() ? { kind: 'error' } : null));
  protected readonly title = computed(() => (this.entryId() ? this.copy.editTitle : this.copy.addTitle));
  protected readonly unit = computed(() => {
    const l = this.loaded();
    return l?.kind === 'new' || l?.kind === 'edit' ? lengthUnitLabel(l.unitSystem) : '';
  });

  protected readonly form = linkedSignal<MeasurementFormValues>(() => {
    const l = this.loaded();
    return l?.kind === 'edit' ? measurementFormOf(l.entry, l.unitSystem) : emptyMeasurementForm(this.today);
  });
  protected readonly errors = signal<MeasurementFormErrors>({});
  protected readonly saving = signal(false);
  /** A write is in progress: every action waits for it. */
  /** Saved and leaving: a second tap (e.g. a double click) can't save again. */
  private readonly saved = signal(false);
  protected readonly busy = computed(() => this.saving() || this.saved());
  /** Announced above Save: validation summary or a failed save. */
  protected readonly status = signal('');

  private readonly fields = viewChildren(TextFieldComponent);

  /** Arm and thigh are single-sided: the hint asks for the same side each time. */
  protected hintFor(site: MeasurementSite): string | undefined {
    return site === 'arm' || site === 'thigh' ? this.copy.hints[site] : undefined;
  }

  protected update(field: keyof MeasurementFormValues, value: string): void {
    this.form.update((f) => ({ ...f, [field]: value }));
    // Filling in any site also clears "enter at least one measurement".
    const clearsGroup = field !== 'date' && value.trim() !== '';
    if (this.errors()[field] || (clearsGroup && this.errors().values)) {
      this.errors.update(({ [field]: _, values, ...rest }) => (clearsGroup || !values ? rest : { ...rest, values }));
    }
  }

  protected async save(): Promise<void> {
    const l = this.loaded();
    if (this.busy() || !l || (l.kind !== 'new' && l.kind !== 'edit')) {
      return; // no double submit
    }
    const original = l.kind === 'edit' ? l.entry : undefined;
    const { input, formatErrors } = readMeasurementForm(this.form(), l.unitSystem, original);
    if (Object.keys(formatErrors).length > 0) {
      // Never sent for saving while a number is ambiguous.
      this.showErrors(measurementFormErrorsOf(validateMeasurementEntryInput(input, this.history.today()), l.unitSystem, formatErrors));
      return;
    }
    this.saving.set(true);
    this.status.set('');
    try {
      const result = original ? await this.history.update(original, input) : await this.history.add(input);
      if (result.ok) {
        this.saved.set(true);
        this.errors.set({});
        void this.nav.navigateBack(MEASUREMENT_RETURN_PATH);
      } else if (result.kind === 'invalid') {
        this.showErrors(measurementFormErrorsOf(result.errors, l.unitSystem));
      } else {
        this.status.set(this.copy.saveFailed);
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    if (!this.busy()) {
      void this.nav.navigateBack(MEASUREMENT_RETURN_PATH);
    }
  }

  protected retry(): void {
    this.state.reload();
  }

  protected backToHistory(): void {
    void this.nav.navigateBack(MEASUREMENT_RETURN_PATH);
  }

  private showErrors(errors: MeasurementFormErrors): void {
    this.errors.set(errors);
    this.status.set(this.copy.fixErrors);
    // Fields are rendered date first, then in site order; a missing-values error focuses the first site.
    const order: (MeasurementSite | 'date')[] = ['date', ...MEASUREMENT_SITES];
    const first = errors.values ? 1 : order.findIndex((field) => errors[field]);
    if (first >= 0) {
      this.fields()[first]?.focus();
    }
  }
}
