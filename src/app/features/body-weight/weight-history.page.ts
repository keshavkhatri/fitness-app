import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, NavController } from '@ionic/angular';

import { WeightHistoryService } from '../../core/body-measurements/weight-history.service';
import { WeightRange, rangeStart, weightRangeSummary } from '../../domain/body-measurements';
import { EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent } from '../../shared/ui';
import { WeightTrendComponent } from './components/weight-trend.component';
import { WEIGHT_HISTORY_COPY } from './weight-history-content';
import { NEW_WEIGHT_PATH, weightEntryPath } from './weight-history-paths';
import { toWeightHistoryScreen } from './weight-history-view-model';
import { WeightChartView, axisDateLabel, toTrendSummary, weightChart } from './weight-trend-view-model';

/**
 * Recorded body weights: a chart and first/latest summary for a chosen range
 * (actual measurements only: no smoothing, forecasts or progress claims), and
 * the full history, newest first. Nothing here changes the profile's weight.
 */
@Component({
  selector: 'app-weight-history',
  templateUrl: './weight-history.page.html',
  styleUrl: './weight-history.page.scss',
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
    WeightTrendComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeightHistoryPage {
  private readonly history = inject(WeightHistoryService);
  private readonly nav = inject(NavController);

  protected readonly copy = WEIGHT_HISTORY_COPY;
  protected readonly screen = computed(() => toWeightHistoryScreen(this.history.state(), this.history.today()));

  /** Kept while the page is open (not persisted). */
  protected readonly range = signal<WeightRange>('30d');
  private readonly rangeSummary = computed(() => {
    const s = this.history.state();
    return s.status === 'ready' ? weightRangeSummary(s.entries, this.range(), this.history.today(), s.unitSystem) : null;
  });
  protected readonly trend = computed(() => {
    const s = this.history.state();
    const summary = this.rangeSummary();
    return summary && s.status === 'ready' ? toTrendSummary(summary, this.range(), s.unitSystem, this.history.today()) : null;
  });
  /** null if the chart can't be built: the summary and text list still show. */
  protected readonly chart = computed<WeightChartView | null>(() => {
    const s = this.history.state();
    const summary = this.rangeSummary();
    if (!summary || s.status !== 'ready') {
      return null;
    }
    const today = this.history.today();
    const start = rangeStart(this.range(), today) ?? summary.first.entry.date;
    try {
      return weightChart.build(summary, start, today, s.unitSystem, { start: axisDateLabel(start, today), end: axisDateLabel(today, today) });
    } catch {
      return null;
    }
  });
  protected readonly emptyRangeTitle = computed(() => this.copy.trend.emptyRange(this.copy.trend.rangeNames[this.range()]));

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
    void this.history.load();
  }

  /** Re-entry: re-read (e.g. the unit system changed in the profile). */
  ionViewWillEnter(): void {
    if (this.entered) {
      void this.history.load();
    }
    this.entered = true;
  }

  protected add(): void {
    void this.nav.navigateForward(NEW_WEIGHT_PATH);
  }

  protected edit(entryId: string): void {
    void this.nav.navigateForward(weightEntryPath(entryId));
  }

  protected retry(): void {
    void this.history.load();
  }
}
