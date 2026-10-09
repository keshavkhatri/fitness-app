import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';

import { WEIGHT_RANGES, WeightRange } from '../../../domain/body-measurements';
import { EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, SegmentOption, SegmentedControlComponent } from '../../../shared/ui';
import { WEIGHT_HISTORY_COPY } from '../weight-history-content';
import { TrendSummaryView, WeightChartView } from '../weight-trend-view-model';
import { WeightChartComponent } from './weight-chart.component';

/**
 * The selected range of recorded weights: range control, chart, first/latest
 * summary and the same measurements as text. Presentational; the page owns
 * the range and computes everything.
 */
@Component({
  selector: 'app-weight-trend',
  template: `
    <section class="trend" aria-labelledby="weight-trend-title" data-testid="weight-trend">
      <h2 class="title" id="weight-trend-title">{{ copy.title }}</h2>
      <fit-segmented-control name="weight-range" [legend]="copy.rangeLegend" [options]="options" [(value)]="range" />

      @if (trend(); as t) {
        <fit-card>
          @if (chart(); as c) {
            <app-weight-chart [chart]="c" [label]="t.description" />
          } @else {
            <p class="note" data-testid="chart-unavailable">{{ copy.chartUnavailable }}</p>
          }

          <dl class="summary" data-testid="trend-summary">
            <div class="fact">
              <dt>{{ copy.first }}</dt>&ngsp;
              <dd><span class="value">{{ t.first.weight }}</span>&ngsp;<span class="date">{{ t.first.dateLabel }}</span></dd>
            </div>&ngsp;
            <div class="fact">
              <dt>{{ copy.latest }}</dt>&ngsp;
              <dd><span class="value">{{ t.latest.weight }}</span>&ngsp;<span class="date">{{ t.latest.dateLabel }}</span></dd>
            </div>&ngsp;
            <div class="fact change">
              <dt>{{ copy.change }}</dt>&ngsp;
              <dd>
                @if (t.change; as change) {
                  <span class="value" data-testid="trend-change">{{ change }}</span>&ngsp;
                }
                <span class="caption">{{ t.changeCaption }}</span>
              </dd>
            </div>
          </dl>

          <ol class="visually-hidden" [attr.aria-label]="copy.measurementsLabel" data-testid="trend-measurements">
            @for (m of t.measurements; track m.key) {
              <li>{{ m.weight }}, {{ m.dateLabel }}</li>
            }
          </ol>
        </fit-card>
      } @else {
        <fit-card data-testid="trend-empty">
          <fit-empty-state icon="scale-outline" [title]="emptyTitle()" [description]="copy.emptyRangeMessage">
            <button fit-button type="button" icon="add" (click)="addWeight.emit()">{{ addLabel }}</button>
          </fit-empty-state>
        </fit-card>
      }
    </section>
  `,
  styleUrl: './weight-trend.component.scss',
  imports: [EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, SegmentedControlComponent, WeightChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeightTrendComponent {
  readonly range = model.required<WeightRange>();
  /** null when the range has no measurements. */
  readonly trend = input.required<TrendSummaryView | null>();
  /** null when the chart couldn't be built (the summary and text remain). */
  readonly chart = input.required<WeightChartView | null>();
  readonly emptyTitle = input.required<string>();
  readonly addWeight = output<void>();

  protected readonly copy = WEIGHT_HISTORY_COPY.trend;
  protected readonly addLabel = WEIGHT_HISTORY_COPY.add;
  protected readonly options: readonly SegmentOption<WeightRange>[] = WEIGHT_RANGES.map((value) => ({ value, label: this.copy.ranges[value] }));
}
