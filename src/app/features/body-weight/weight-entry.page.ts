import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, linkedSignal, resource, signal, viewChild } from '@angular/core';
import { IonContent, IonFooter, IonIcon, NavController } from '@ionic/angular';

import { ProfileWeightPreview, ProfileWeightService, ProfileWeightUnavailable } from '../../core/body-measurements/profile-weight.service';
import { ThemeService } from '../../core/theme/theme.service';
import { WeightHistoryService } from '../../core/body-measurements/weight-history.service';
import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import { ASSESSMENT_PATH } from '../../core/profile/onboarding.guards';
import { WeightEntry, sortWeightEntries, validateWeightEntryInput } from '../../domain/body-measurements';
import { UnitSystem, weightInUnit, weightUnitLabel } from '../../domain/fitness-profile';
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
  ProfileWeightView,
  describeEntry,
  emptyWeightForm,
  readWeightForm,
  toProfileWeightView,
  weightFormErrorsOf,
  weightFormOf,
  weightSlider,
} from './weight-history-view-model';

type Loaded =
  | { readonly kind: 'new'; readonly unitSystem: UnitSystem }
  | { readonly kind: 'edit'; readonly unitSystem: UnitSystem; readonly entry: WeightEntry }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'error' };

/** The "Use as profile weight" sheet. */
type ProfileWeightSheet =
  | { readonly kind: 'checking' }
  | { readonly kind: 'confirm' | 'saving' | 'failed'; readonly entryId: string; readonly view: ProfileWeightView }
  | { readonly kind: 'same'; readonly view: ProfileWeightView }
  | { readonly kind: 'unavailable'; readonly reason: ProfileWeightUnavailable };

/**
 * Add or edit one weigh-in: `/you/weight-history/new` or `/you/weight-history/:entryId`.
 * Saves to the history only; nothing is shown as saved or deleted until storage confirmed it.
 *
 * An existing entry can also be used as the profile's weight, after a
 * confirmation. Like any profile edit, the updated assessment is shown next.
 */
@Component({
  selector: 'app-weight-entry',
  templateUrl: './weight-entry.page.html',
  styleUrl: './weight-entry.page.scss',
  host: { class: 'fit-theme-immersive' },
  imports: [
    IonContent,
    IonFooter,
    IonIcon,
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
  private readonly profiles = inject(FitnessProfileService);
  private readonly profileWeight = inject(ProfileWeightService);

  protected readonly copy = WEIGHT_HISTORY_COPY.form;
  // Light status-bar text while this always-dark form is open.
  private readonly statusBar = inject(DestroyRef).onDestroy(inject(ThemeService).holdAlwaysDark());
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
  /** Fine adjustment around the entry being edited, or the latest recorded weight; none without either. */
  protected readonly slider = computed(() => {
    const l = this.loaded();
    if (l?.kind !== 'new' && l?.kind !== 'edit') {
      return null;
    }
    const s = this.history.state();
    const latest = s.status === 'ready' ? sortWeightEntries(s.entries).at(-1) : undefined;
    const reference = l.kind === 'edit' ? l.entry : latest;
    return weightSlider(reference ? weightInUnit(reference.weight, l.unitSystem) : null, this.form().weight, l.unitSystem);
  });
  protected readonly errors = signal<WeightFormErrors>({});
  protected readonly saving = signal(false);
  /** The profile weight is being updated. */
  protected readonly profileSaving = signal(false);
  /** Any write in progress: every action waits for it. */
  /** Saved and leaving: a second tap (e.g. a double click) can't save again. */
  private readonly saved = signal(false);
  protected readonly busy = computed(() => this.saving() || this.profileSaving() || this.saved());
  /** Announced above Save: validation summary or a failed save/delete. */
  protected readonly status = signal('');
  protected readonly confirmOpen = signal(false);

  protected readonly profileCopy = this.copy.profileWeight;
  /** Only offered for a saved entry while a profile exists. */
  protected readonly canUseAsProfileWeight = computed(() => this.loaded()?.kind === 'edit' && this.profiles.hasProfile());
  protected readonly profileSheetOpen = signal(false);
  protected readonly profileSheet = signal<ProfileWeightSheet>({ kind: 'checking' });
  protected readonly profileSheetTitle = computed(() => {
    switch (this.profileSheet().kind) {
      case 'same':
        return this.profileCopy.same.title;
      case 'unavailable':
        return this.profileCopy.unavailableTitle;
      default:
        return this.profileCopy.title;
    }
  });
  /** The form differs from the saved entry (which is what gets used). */
  protected readonly unsavedChanges = computed(() => {
    const l = this.loaded();
    if (l?.kind !== 'edit') {
      return false;
    }
    const saved = weightFormOf(l.entry, l.unitSystem);
    const f = this.form();
    return f.weight !== saved.weight || f.date !== saved.date;
  });
  private previewToken = 0;

  /** "80.4 kg, Yesterday" for the delete confirmation. */
  protected readonly entrySummary = computed(() => {
    const l = this.loaded();
    return l?.kind === 'edit' ? describeEntry(l.entry, l.unitSystem, this.today) : '';
  });

  private readonly weightField = viewChild<TextFieldComponent>('weightField');
  private readonly dateField = viewChild<TextFieldComponent>('dateField');
  private readonly profileSheetRef = viewChild<BottomSheetComponent>('profileWeightSheet');

  protected update(field: keyof WeightFormValues, value: string): void {
    this.form.update((f) => ({ ...f, [field]: value }));
    if (this.errors()[field]) {
      this.errors.update(({ [field]: _, ...rest }) => rest);
    }
  }

  protected slide(value: string): void {
    const n = Number(value);
    if (Number.isFinite(n)) {
      this.update('weight', n.toFixed(1));
    }
  }

  protected async save(): Promise<void> {
    const l = this.loaded();
    if (this.busy() || !l || (l.kind !== 'new' && l.kind !== 'edit')) {
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
        this.saved.set(true);
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
    if (!this.busy()) {
      this.confirmOpen.set(true);
    }
  }

  protected cancelDelete(): void {
    this.confirmOpen.set(false);
  }

  protected async confirmDelete(): Promise<void> {
    const l = this.loaded();
    this.confirmOpen.set(false);
    if (l?.kind !== 'edit' || this.busy()) {
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

  /** Opens the confirmation with what would change; nothing is saved yet. */
  protected async askUseAsProfileWeight(): Promise<void> {
    const l = this.loaded();
    if (l?.kind !== 'edit' || this.busy()) {
      return;
    }
    const token = ++this.previewToken;
    this.profileSheet.set({ kind: 'checking' });
    this.profileSheetOpen.set(true);
    const preview = await this.profileWeight.preview(l.entry.id);
    if (token === this.previewToken && this.profileSheet().kind === 'checking') {
      this.profileSheet.set(this.sheetFor(preview));
    }
  }

  protected closeProfileSheet(): void {
    if (!this.profileSaving()) {
      this.profileSheetOpen.set(false);
    }
  }

  protected async confirmUseAsProfileWeight(): Promise<void> {
    const sheet = this.profileSheet();
    if ((sheet.kind !== 'confirm' && sheet.kind !== 'failed') || this.busy()) {
      return; // no double submit
    }
    this.profileSaving.set(true);
    this.profileSheet.set({ ...sheet, kind: 'saving' });
    try {
      const result = await this.profileWeight.apply(sheet.entryId);
      if (result.ok && result.kind === 'updated') {
        // Dismissed before leaving: this page's bindings stop updating once it's no longer active.
        await this.profileSheetRef()?.dismiss().catch(() => false);
        this.profileSheetOpen.set(false);
        // As after any profile edit: review the recalculated assessment next.
        void this.nav.navigateForward(ASSESSMENT_PATH);
      } else if (result.ok) {
        this.profileSheet.set({ kind: 'same', view: sheet.view });
      } else if (result.kind === 'save-failed') {
        this.profileSheet.set({ ...sheet, kind: 'failed' });
        if (!this.profileSheetOpen()) {
          this.status.set(this.profileCopy.saveFailed); // the sheet was swiped away meanwhile
        }
      } else {
        this.profileSheet.set({ kind: 'unavailable', reason: result.kind });
      }
    } finally {
      this.profileSaving.set(false);
    }
  }

  protected retry(): void {
    this.state.reload();
  }

  protected backToHistory(): void {
    void this.nav.navigateBack(WEIGHT_HISTORY_PATH);
  }

  private sheetFor(preview: ProfileWeightPreview): ProfileWeightSheet {
    if (preview.kind !== 'ready' && preview.kind !== 'same') {
      return { kind: 'unavailable', reason: preview.kind };
    }
    const view = toProfileWeightView(preview.entry, preview.current, preview.unitSystem, this.today);
    return preview.kind === 'same' ? { kind: 'same', view } : { kind: 'confirm', entryId: preview.entry.id, view };
  }

  private showErrors(errors: WeightFormErrors): void {
    this.errors.set(errors);
    this.status.set(this.copy.fixErrors);
    (errors.weight ? this.weightField() : this.dateField())?.focus();
  }
}
