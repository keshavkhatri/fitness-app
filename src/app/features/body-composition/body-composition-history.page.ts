import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IonBackButton, IonIcon, NavController } from '@ionic/angular';

import { BodyCompositionHistoryService } from '../../core/body-composition/body-composition-history.service';
import { EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent, PageLayoutComponent } from '../../shared/ui';
import { ReportThumbComponent } from './components/report-thumb.component';
import { BODY_COMPOSITION_COPY } from './body-composition-content';
import { toBodyCompositionHistoryScreen } from './body-composition-history-view-model';
import { NEW_BODY_COMPOSITION_PATH, bodyCompositionDetailPath } from './body-composition-paths';

/**
 * Recorded body-composition assessments: the latest reported value of each
 * metric, and every readable assessment newest first (key values; tap for
 * the full assessment), in the unit each report used. Only reads: nothing here changes the
 * profile, weight history or measurements (editing and deleting happen on
 * the assessment's page). Stored assessments this version can't read are counted
 * (never changed) so the user knows they exist.
 */
@Component({
  selector: 'app-body-composition-history',
  templateUrl: './body-composition-history.page.html',
  styleUrl: './body-composition-history.page.scss',
  host: { class: 'fit-theme-dashboard fit-tracking-page' },
  imports: [
    IonBackButton,
    IonIcon,
    PageLayoutComponent,
    ReportThumbComponent,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BodyCompositionHistoryPage {
  private readonly history = inject(BodyCompositionHistoryService);
  private readonly nav = inject(NavController);

  protected readonly copy = BODY_COMPOSITION_COPY.history;
  protected readonly screen = computed(() => toBodyCompositionHistoryScreen(this.history.state(), this.history.today()));
  /** Stored assessments that can't be shown (e.g. details from a newer app version). */
  protected readonly unsupportedCount = signal(0);
  protected readonly unsupportedMessage = computed(() => this.copy.unsupported(this.unsupportedCount()));

  /** One persistent live region: loading and errors. */
  protected readonly announcement = computed(() => {
    switch (this.screen().kind) {
      case 'loading':
        return this.copy.loading;
      case 'error':
        return this.copy.error.title;
      default:
        return '';
    }
  });

  private entered = false;

  constructor() {
    void this.refresh();
  }

  /** Re-entry: re-read (e.g. after adding an assessment). */
  ionViewWillEnter(): void {
    if (this.entered) {
      void this.refresh();
    }
    this.entered = true;
  }

  protected add(): void {
    void this.nav.navigateForward(NEW_BODY_COMPOSITION_PATH);
  }

  protected open(id: string): void {
    void this.nav.navigateForward(bodyCompositionDetailPath(id));
  }

  protected retry(): void {
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    await this.history.load();
    if (this.history.state().status !== 'ready') {
      this.unsupportedCount.set(0);
      return;
    }
    try {
      this.unsupportedCount.set(await this.history.unsupportedAssessmentCount());
    } catch {
      // The store became unreadable after listing: the next load shows the error.
      this.unsupportedCount.set(0);
    }
  }
}
