import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, resource, signal, viewChild } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonFooter, IonHeader, IonTitle, IonToolbar, NavController } from '@ionic/angular';

import { WeightHistoryService } from '../../core/body-measurements/weight-history.service';
import { WeightEntry, validateWeightEntryInput } from '../../domain/body-measurements';
import { UnitSystem, weightUnitLabel } from '../../domain/fitness-profile';
import {
  BottomSheetComponent,
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  TextFieldComponent,
} from '../../shared/ui';
import { WEIGHT_HISTORY_COPY } from './weight-history-content';
import { WEIGHT_HISTORY_PATH } from './weight-history-paths';
import {
  WeightFormErrors,
  WeightFormValues,
  describeEntry,
  emptyWeightForm,
  readWeightForm,
  weightFormErrorsOf,
  weightFormOf,
} from './weight-history-view-model';

type Loaded =
  | { readonly kind: 'new'; readonly unitSystem: UnitSystem }
  | { readonly kind: 'edit'; readonly unitSystem: UnitSystem; readonly entry: WeightEntry }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'error' };

/**
 * Add or edit one weigh-in: `/you/weight-history/new` or `/you/weight-history/:entryId`.
 * Saves to the history only; nothing is shown as saved or deleted until storage confirmed it.
 */
@Component({
  selector: 'app-weight-entry',
  templateUrl: './weight-entry.page.html',
  styleUrl: './weight-entry.page.scss',
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonFooter,
    BottomSheetComponent,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeightEntryPage {
  /** Route parameter; absent when adding. */
  readonly entryId = input<string>();

  private readonly history = inject(WeightHistoryService);
  private readonly nav = inject(NavController);

  protected readonly copy = WEIGHT_HISTORY_COPY.form;
  protected readonly historyPath = WEIGHT_HISTORY_PATH;
  protected readonly today = this.history.today();

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
      return entry ? { kind: 'edit', unitSystem: s.unitSystem, entry } : { kind: 'not-found' };
    },
  });

  /** null while loading. */
  protected readonly loaded = computed<Loaded | null>(() => (this.state.hasValue() ? this.state.value() : this.state.error() ? { kind: 'error' } : null));
  protected readonly title = computed(() => (this.entryId() ? this.copy.editTitle : this.copy.addTitle));
  protected readonly unit = computed(() => {
    const l = this.loaded();
    return l?.kind === 'new' || l?.kind === 'edit' ? weightUnitLabel(l.unitSystem) : '';
  });

  protected readonly form = linkedSignal<WeightFormValues>(() => {
    const l = this.loaded();
    return l?.kind === 'edit' ? weightFormOf(l.entry, l.unitSystem) : emptyWeightForm(this.today);
  });
  protected readonly errors = signal<WeightFormErrors>({});
  protected readonly saving = signal(false);
  /** Announced above Save: validation summary or a failed save/delete. */
  protected readonly status = signal('');
  protected readonly confirmOpen = signal(false);

  /** "80.4 kg, Yesterday" for the delete confirmation. */
  protected readonly entrySummary = computed(() => {
    const l = this.loaded();
    return l?.kind === 'edit' ? describeEntry(l.entry, l.unitSystem, this.today) : '';
  });

  private readonly weightField = viewChild<TextFieldComponent>('weightField');
  private readonly dateField = viewChild<TextFieldComponent>('dateField');

  protected update(field: keyof WeightFormValues, value: string): void {
    this.form.update((f) => ({ ...f, [field]: value }));
    if (this.errors()[field]) {
      this.errors.update(({ [field]: _, ...rest }) => rest);
    }
  }

  protected async save(): Promise<void> {
    const l = this.loaded();
    if (this.saving() || !l || (l.kind !== 'new' && l.kind !== 'edit')) {
      return; // no double submit
    }
    const original = l.kind === 'edit' ? l.entry : undefined;
    const { input, formatError } = readWeightForm(this.form(), l.unitSystem, original);
    if (formatError) {
      // Never sent for saving while the number is ambiguous.
      this.showErrors(weightFormErrorsOf(validateWeightEntryInput(input, this.history.today()), l.unitSystem, formatError));
      return;
    }
    this.saving.set(true);
    this.status.set('');
    try {
      const result = original ? await this.history.update(original, input) : await this.history.add(input);
      if (result.ok) {
        this.errors.set({});
        void this.nav.navigateBack(WEIGHT_HISTORY_PATH);
      } else if (result.kind === 'invalid') {
        this.showErrors(weightFormErrorsOf(result.errors, l.unitSystem));
      } else {
        this.status.set(this.copy.saveFailed);
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected askDelete(): void {
    if (!this.saving()) {
      this.confirmOpen.set(true);
    }
  }

  protected cancelDelete(): void {
    this.confirmOpen.set(false);
  }

  protected async confirmDelete(): Promise<void> {
    const l = this.loaded();
    this.confirmOpen.set(false);
    if (l?.kind !== 'edit' || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.status.set('');
    try {
      if ((await this.history.remove(l.entry)).ok) {
        void this.nav.navigateBack(WEIGHT_HISTORY_PATH);
      } else {
        this.status.set(this.copy.deleteFailed);
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected retry(): void {
    this.state.reload();
  }

  protected backToHistory(): void {
    void this.nav.navigateBack(WEIGHT_HISTORY_PATH);
  }

  private showErrors(errors: WeightFormErrors): void {
    this.errors.set(errors);
    this.status.set(this.copy.fixErrors);
    (errors.weight ? this.weightField() : this.dateField())?.focus();
  }
}
