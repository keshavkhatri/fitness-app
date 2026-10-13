import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, NavController } from '@ionic/angular';

import { CalorieCheckInService, CheckInChangeResult } from '../../core/calorie-check-in/calorie-check-in.service';
import { CLOCK, localIsoDate } from '../../core/time/clock';
import { BottomSheetComponent, EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent } from '../../shared/ui';
import { NEW_WEIGHT_PATH, WEIGHT_HISTORY_PATH } from '../body-weight/weight-history-paths';
import { NEW_FOOD_PATH, NUTRITION_PATH } from '../nutrition/nutrition-paths';
import { suggestedMeal } from '../nutrition/nutrition-view-model';
import { CHECK_IN_COPY } from './calorie-check-in-content';
import { CheckInLink, CheckInScreen, toCheckInScreen } from './calorie-check-in-view-model';

type PageState = { readonly kind: 'loading' } | { readonly kind: 'error' } | ({ readonly kind: 'ready' } & CheckInScreen);
type Sheet = 'none' | 'accept' | 'formula';

/**
 * Calorie Check-in: logged intake against the weight trend over the last 4
 * weeks, an estimated maintenance range, and a proposed calorie target that
 * is saved only after the user confirms it in a sheet. Keeping the target,
 * cancelling, leaving or reloading changes nothing.
 */
@Component({
  selector: 'app-calorie-check-in',
  templateUrl: './calorie-check-in.page.html',
  styleUrl: './calorie-check-in.page.scss',
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonIcon,
    BottomSheetComponent,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalorieCheckInPage {
  private readonly checkIns = inject(CalorieCheckInService);
  private readonly nav = inject(NavController);
  private readonly clock = inject(CLOCK);

  protected readonly copy = CHECK_IN_COPY;
  protected readonly nutritionPath = NUTRITION_PATH;

  private readonly state = resource({ loader: async () => toCheckInScreen(await this.checkIns.load()) });

  /** Keeps the shown check-in while reloading (no flash back to the skeleton). */
  protected readonly screen = computed<PageState>(() => {
    if (this.state.hasValue()) {
      return { kind: 'ready', ...this.state.value() };
    }
    return this.state.error() ? { kind: 'error' } : { kind: 'loading' };
  });

  /** "Keep current target" for this visit: hides the proposal; nothing is saved. */
  protected readonly kept = signal(false);
  protected readonly sheet = signal<Sheet>('none');
  protected readonly saving = signal(false);
  protected readonly sheetFailed = signal(false);
  /** Outcome of the last change (saved / data changed), announced once. */
  protected readonly outcome = signal<string | null>(null);

  protected readonly acceptOpen = computed(() => this.sheet() === 'accept');
  protected readonly formulaOpen = computed(() => this.sheet() === 'formula');

  /** One persistent live region. */
  protected readonly announcement = computed(() => {
    const s = this.screen();
    if (s.kind === 'loading') {
      return this.copy.loading;
    }
    if (s.kind === 'error') {
      return this.copy.error.title;
    }
    return this.outcome() ?? (this.kept() ? this.copy.recommendation.kept : '');
  });

  private entered = false;

  /** Re-entry (e.g. back from logging food or weight): re-read everything. Nothing is applied. */
  ionViewWillEnter(): void {
    if (this.entered) {
      this.reload();
    }
    this.entered = true;
  }

  protected retry(): void {
    this.state.reload();
  }

  protected keep(): void {
    this.kept.set(true);
    this.outcome.set(null);
  }

  protected review(): void {
    this.sheetFailed.set(false);
    this.sheet.set('accept');
  }

  protected reviewFormula(): void {
    this.sheetFailed.set(false);
    this.sheet.set('formula');
  }

  protected setSheetOpen(sheet: Exclude<Sheet, 'none'>, open: boolean): void {
    if (!open && this.sheet() === sheet && !this.saving()) {
      this.sheet.set('none');
    }
  }

  protected closeSheet(): void {
    if (!this.saving()) {
      this.sheet.set('none');
    }
  }

  protected async confirmAccept(): Promise<void> {
    const s = this.screen();
    const proposal = s.kind === 'ready' ? s.recommendation.proposal : null;
    if (!proposal || this.saving()) {
      return;
    }
    await this.change(() => this.checkIns.accept(proposal.confirm));
  }

  protected async confirmFormula(): Promise<void> {
    if (!this.saving()) {
      await this.change(() => this.checkIns.useFormula());
    }
  }

  protected open(link: CheckInLink): void {
    switch (link) {
      case 'log-food':
        void this.nav.navigateForward(NEW_FOOD_PATH, { queryParams: { meal: suggestedMeal(this.clock()), date: localIsoDate(this.clock()) } });
        return;
      case 'log-weight':
        void this.nav.navigateForward(NEW_WEIGHT_PATH);
        return;
      case 'weight-history':
        void this.nav.navigateForward(WEIGHT_HISTORY_PATH);
        return;
    }
  }

  private async change(run: () => Promise<CheckInChangeResult>): Promise<void> {
    this.saving.set(true);
    this.sheetFailed.set(false);
    let result: CheckInChangeResult;
    try {
      result = await run();
    } catch {
      result = { ok: false, kind: 'save-failed' };
    }
    this.saving.set(false);
    if (!result.ok && result.kind === 'save-failed') {
      this.sheetFailed.set(true);
      return;
    }
    this.sheet.set('none');
    this.outcome.set(
      result.ok
        ? result.targetKcal !== null
          ? this.copy.confirm.saved(new Intl.NumberFormat('en-US').format(result.targetKcal))
          : this.copy.confirm.formulaSaved
        : this.copy.confirm.changed,
    );
    this.reload();
  }

  private reload(): void {
    this.kept.set(false);
    this.state.reload();
  }
}
