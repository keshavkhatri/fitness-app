import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';

import { WEIGHT_RANGES, WeightRange } from '../../../domain/body-measurements';
import { EmptyStateComponent, FitnessButtonComponent, PointChartComponent, SegmentOption, SegmentedControlComponent } from '../../../shared/ui';
import { WEIGHT_HISTORY_COPY } from '../weight-history-content';
import { PointChartView, TrendSummaryView } from '../weight-trend-view-model';

/**
 * The selected range of recorded weights: range control, chart, first/latest
 * summary and the same measurements as text. Presentational; the page owns
 * the range and computes everything.
 */
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

@Component({
  selector: 'app-weight-trend',
  template: `
    <section class="trend" aria-labelledby="weight-trend-title" data-testid="weight-trend">
      <h2 class="visually-hidden" id="weight-trend-title">{{ copy.title }}</h2>
      <fit-segmented-control variant="ink" name="weight-range" [legend]="copy.rangeLegend" [options]="options" [(value)]="range" />

      @if (trend(); as t) {
        <div class="card">
          <dl class="summary" data-testid="trend-summary">
            <div class="fact latest">
              <dt>{{ copy.latest }}</dt>&ngsp;
              <dd><span class="value">{{ t.latest.weight }}</span>&ngsp;<span class="date">{{ t.latest.dateLabel }}</span></dd>
            </div>&ngsp;
            @if (t.change; as change) {
              <div class="fact change">
                <dt>{{ copy.change }}</dt>&ngsp;
                <dd>
                  <span class="change-value" data-testid="trend-change">{{ change }}</span>&ngsp;
                  <span class="caption">{{ t.changeFrom }}</span>
                </dd>
              </div>&ngsp;
            } @else {
              <p class="caption single">{{ t.changeCaption }}</p>
            }
            @if (t.lowest && t.highest) {
              <div class="fact side">
                <dt>{{ copy.lowest }}</dt>&ngsp;
                <dd><span class="side-value">{{ t.lowest.weight }}</span>&ngsp;<span class="date">{{ t.lowest.dateLabel }}</span></dd>
              </div>&ngsp;
              <div class="fact side">
                <dt>{{ copy.highest }}</dt>&ngsp;
                <dd><span class="side-value">{{ t.highest.weight }}</span>&ngsp;<span class="date">{{ t.highest.dateLabel }}</span></dd>
              </div>
            }
          </dl>
          <p class="visually-hidden">{{ t.changeCaption }}</p>
        </div>

        <div class="card">
          @if (chart(); as c) {
            <fit-point-chart [points]="c.points" [label]="t.description" [caption]="c.caption" [unit]="c.unit" [minSpan]="c.minSpan" [listLabel]="copy.measurementsLabel" />
          } @else {
            <p class="note" data-testid="chart-unavailable">{{ copy.chartUnavailable }}</p>
          }
          <ol class="visually-hidden" [attr.aria-label]="copy.measurementsLabel" data-testid="trend-measurements">
            @for (m of t.measurements; track m.key) {
              <li>{{ m.weight }}, {{ m.dateLabel }}</li>
            }
          </ol>
        </div>
      } @else {
        <div class="card" data-testid="trend-empty">
          <fit-empty-state icon="scale-outline" [title]="emptyTitle()" [description]="copy.emptyRangeMessage">
            <button fit-button type="button" icon="add" (click)="addWeight.emit()">{{ addLabel }}</button>
          </fit-empty-state>
        </div>
      }
    </section>
  `,
  styleUrl: './weight-trend.component.scss',
  imports: [EmptyStateComponent, FitnessButtonComponent, PointChartComponent, SegmentedControlComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeightTrendComponent {
  readonly range = model.required<WeightRange>();
  /** null when the range has no measurements. */
  readonly trend = input.required<TrendSummaryView | null>();
  /** null when the chart couldn't be built (the summary and text remain). */
  readonly chart = input.required<PointChartView | null>();
  readonly emptyTitle = input.required<string>();
  readonly addWeight = output<void>();

  protected readonly copy = WEIGHT_HISTORY_COPY.trend;
  protected readonly addLabel = WEIGHT_HISTORY_COPY.add;
  protected readonly options: readonly SegmentOption<WeightRange>[] = WEIGHT_RANGES.map((value) => ({
    value,
    label: this.copy.ranges[value],
    spoken: capitalize(this.copy.rangeNames[value]),
  }));
}
