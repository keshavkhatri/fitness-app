import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, NavController } from '@ionic/angular';

import { MeasurementHistoryService } from '../../core/body-measurements/measurement-history.service';
import { EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent } from '../../shared/ui';
import { MEASUREMENT_COPY } from './measurement-content';
import { toMeasurementHistoryScreen } from './measurement-history-view-model';
import { NEW_MEASUREMENT_PATH, measurementEntryPath } from './measurement-paths';

/**
 * Recorded body measurements: the latest value of each site, and every
 * readable entry, newest first. Only reads; nothing here changes the
 * profile or weight history. Stored entries this version can't read are
 * counted (never changed) so the user knows they exist.
 */
@Component({
  selector: 'app-measurement-history',
  templateUrl: './measurement-history.page.html',
  styleUrl: './measurement-history.page.scss',
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonIcon,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MeasurementHistoryPage {
  private readonly history = inject(MeasurementHistoryService);
  private readonly nav = inject(NavController);

  protected readonly copy = MEASUREMENT_COPY.history;
  protected readonly screen = computed(() => toMeasurementHistoryScreen(this.history.state(), this.history.today()));
  /** Stored entries that can't be shown (e.g. sites from a newer app version). */
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

  /** Re-entry: re-read (e.g. after adding or editing, or the unit system changed in the profile). */
  ionViewWillEnter(): void {
    if (this.entered) {
      void this.refresh();
    }
    this.entered = true;
  }

  protected add(): void {
    void this.nav.navigateForward(NEW_MEASUREMENT_PATH);
  }

  protected edit(entryId: string): void {
    void this.nav.navigateForward(measurementEntryPath(entryId));
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
      this.unsupportedCount.set(await this.history.unsupportedEntryCount());
    } catch {
      // The store became unreadable after listing: the next load shows the error.
      this.unsupportedCount.set(0);
    }
  }
}
