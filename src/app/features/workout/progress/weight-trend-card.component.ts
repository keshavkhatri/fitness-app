import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';

import { WEIGHT_RANGES, WeightRange } from '../../../domain/body-measurements';
import { FitnessButtonComponent, PointChartComponent, SegmentOption, SegmentedControlComponent } from '../../../shared/ui';
import { PointChartView, TrendSummaryView } from '../../body-weight/weight-trend-view-model';
import { WEIGHT_HISTORY_COPY } from '../../body-weight/weight-history-content';
import { WORKOUT_COPY } from '../workout-content';

export type WeightTrendState = 'loading' | 'error' | 'none' | 'ready';

/**
 * Recorded weights for a range (the weight history's own ranges and chart):
 * the latest measurement called out, the chart, and honest states for no
 * weigh-ins, an empty range and a single point (no trend from one point).
 * Presentational; the page owns the range.
 */
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

@Component({
  selector: 'app-weight-trend-card',
  template: `
    <section class="card" aria-labelledby="progress-weight" data-testid="weight-trend">
      <div class="head">
        <h2 class="title" id="progress-weight">{{ copy.title }}</h2>
        @if (state() === 'ready') {
          <fit-segmented-control class="ranges" variant="compact" name="progress-weight-range" [legend]="copy.rangeLegend" [options]="options" [(value)]="range" />
        }
      </div>

      @switch (state()) {
        @case ('ready') {
          @if (trend(); as t) {
            @if (chart(); as c) {
              <fit-point-chart [points]="c.points" [label]="t.description" [caption]="c.caption" [unit]="c.unit" [minSpan]="c.minSpan" />
            }
            @if (t.measurements.length === 1) {
              <p class="note" data-testid="weight-single">{{ copy.single }}</p>
            }
          } @else {
            <p class="note" data-testid="weight-range-empty">{{ copy.empty }}</p>
          }
          <button fit-button type="button" variant="ghost" class="see-all" (click)="openHistory.emit()">{{ copy.seeAll }}</button>
        }
        @case ('none') {
          <p class="note" data-testid="weight-none">{{ copy.none }}</p>
          <button fit-button type="button" variant="secondary" icon="add" (click)="addWeight.emit()">{{ copy.add }}</button>
        }
        @case ('error') {
          <p class="note" data-testid="weight-error">{{ copy.unavailable }}</p>
        }
        @default {
          <p class="note" aria-busy="true">…</p>
        }
      }
    </section>
  `,
  styleUrl: './weight-trend-card.component.scss',
  imports: [FitnessButtonComponent, PointChartComponent, SegmentedControlComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeightTrendCardComponent {
  readonly state = input.required<WeightTrendState>();
  readonly range = model.required<WeightRange>();
  readonly trend = input<TrendSummaryView | null>(null);
  readonly chart = input<PointChartView | null>(null);
  readonly openHistory = output<void>();
  readonly addWeight = output<void>();


  protected readonly copy = WORKOUT_COPY.progress.weight;
  protected readonly options: readonly SegmentOption<WeightRange>[] = WEIGHT_RANGES.map((value) => ({
    value,
    label: this.copy.ranges[value],
    spoken: capitalize(WEIGHT_HISTORY_COPY.trend.rangeNames[value]),
  }));
}
