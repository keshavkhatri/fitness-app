import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IonBackButton, IonIcon, NavController } from '@ionic/angular';

import { MeasurementHistoryService } from '../../core/body-measurements/measurement-history.service';
import { MEASUREMENT_SITES as MEASUREMENT_SITE_ORDER, MeasurementSite, WEIGHT_RANGES, WeightRange } from '../../domain/body-measurements';
import {
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  LoadingSkeletonComponent,
  PageLayoutComponent,
  SegmentOption,
  SegmentedControlComponent,
} from '../../shared/ui';
import { WEIGHT_HISTORY_COPY } from '../body-weight/weight-history-content';
import { MeasurementChartComponent } from './components/measurement-chart.component';
import { measurementChart, sitesInRange } from './measurement-chart';
import { MEASUREMENT_COPY } from './measurement-content';
import { toMeasurementHistoryScreen } from './measurement-history-view-model';
import { NEW_MEASUREMENT_PATH, measurementEntryPath } from './measurement-paths';

type MeasurementView = 'chart' | 'list';
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Recorded body measurements: a chart of the sites over a range (Chart), or
 * every readable entry, newest first (List); the latest value of each site
 * in both. Only reads; nothing here changes the
 * profile or weight history. Stored entries this version can't read are
 * counted (never changed) so the user knows they exist.
 */
@Component({
  selector: 'app-measurement-history',
  templateUrl: './measurement-history.page.html',
  styleUrl: './measurement-history.page.scss',
  host: { class: 'fit-theme-dashboard fit-tracking-page' },
  imports: [
    IonBackButton,
    IonIcon,
    PageLayoutComponent,
    SegmentedControlComponent,
    MeasurementChartComponent,
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
  // UI state only (kept while the page is open).
  protected readonly view = signal<MeasurementView>('chart');
  protected readonly range = signal<WeightRange>('90d');
  private readonly hidden = signal<ReadonlySet<MeasurementSite>>(new Set());
  protected readonly viewOptions: readonly SegmentOption<MeasurementView>[] = [
    { value: 'chart', label: this.copy.chartView },
    { value: 'list', label: this.copy.listView },
  ];
  private readonly rangeCopy = WEIGHT_HISTORY_COPY.trend;
  protected readonly rangeOptions: readonly SegmentOption<WeightRange>[] = WEIGHT_RANGES.map((value) => ({
    value,
    label: this.rangeCopy.ranges[value],
    spoken: capitalize(this.rangeCopy.rangeNames[value]),
  }));
  private readonly entries = computed(() => {
    const s = this.history.state();
    return s.status === 'ready' ? s : null;
  });
  /** Sites read in the range, each shown unless switched off. */
  protected readonly sites = computed(() => {
    const s = this.entries();
    return s
      ? sitesInRange(s.entries, this.range(), this.history.today()).map((site) => ({
          site,
          index: (MEASUREMENT_SITE_ORDER as readonly string[]).indexOf(site),
          label: this.siteLabels[site],
          shown: !this.hidden().has(site),
        }))
      : [];
  });
  protected readonly chart = computed(() => {
    const s = this.entries();
    const shown = this.sites().filter((x) => x.shown).map((x) => x.site);
    return s && shown.length ? measurementChart(s.entries, shown, this.range(), this.history.today(), s.unitSystem) : null;
  });
  protected readonly hasSingle = computed(() => this.chart()?.series.some((x) => x.points.length === 1) ?? false);
  protected readonly chartLabel = computed(() => this.copy.chartLabel(this.rangeCopy.rangeNames[this.range()]));
  protected readonly noneInRange = computed(() => this.copy.noneInRange(this.rangeCopy.rangeNames[this.range()]));
  private readonly siteLabels = MEASUREMENT_COPY.sites;

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

  protected toggleSite(site: MeasurementSite): void {
    this.hidden.update((h) => {
      const next = new Set(h);
      if (!next.delete(site)) {
        next.add(site);
      }
      return next;
    });
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
