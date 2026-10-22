import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';

import { BodyCompositionMetric } from '../../../domain/body-composition';
import { WEIGHT_RANGES, WeightRange } from '../../../domain/body-measurements';
import { FitnessButtonComponent, PointChartComponent, SegmentOption, SegmentedControlComponent } from '../../../shared/ui';
import { WEIGHT_HISTORY_COPY } from '../../body-weight/weight-history-content';
import { WORKOUT_COPY } from '../workout-content';
import { CompositionTrendView } from './composition-trend-view-model';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Body fat, muscle and the other InBody values over time: one metric at a time (chosen from those that have
 * readings), in the same chart and ranges as the weight trend. Presentational; the page owns the metric and range.
 */
@Component({
  selector: 'app-composition-trend-card',
  template: `
    @let v = view();
    <section class="card" aria-labelledby="progress-composition" data-testid="composition-trend">
      <div class="head">
        <h2 class="title" id="progress-composition">{{ copy.title }}</h2>
        @if (v.kind === 'ready') {
          <fit-segmented-control class="ranges" variant="compact" name="progress-composition-range" [legend]="copy.rangeLegend" [options]="ranges" [(value)]="range" />
        }
      </div>

      @if (v.kind === 'ready') {
        <div class="metrics" role="radiogroup" [attr.aria-label]="copy.metricLegend" data-testid="composition-metrics">
          @for (option of v.options; track option.metric) {
            <button
              type="button"
              class="metric"
              role="radio"
              [attr.aria-checked]="option.metric === v.metric"
              [attr.data-testid]="'trend-' + option.metric"
              (click)="choose(option.metric, $event)"
            >
              {{ option.label }}
            </button>
          }
        </div>
        @if (v.chart; as chart) {
          <fit-point-chart [points]="chart.points" [label]="v.description" [caption]="chart.caption" [unit]="chart.unit" [minSpan]="chart.minSpan" />
          @if (v.count === 1) {
            <p class="note" data-testid="composition-single">{{ copy.single }}</p>
          }
        } @else {
          <p class="note" data-testid="composition-range-empty">{{ copy.empty }}</p>
        }
        <button fit-button type="button" variant="ghost" class="see-all" (click)="openComposition.emit()">{{ copy.seeAll }}</button>
      } @else {
        <p class="note" data-testid="composition-none">{{ copy.none }}</p>
        <button fit-button type="button" variant="secondary" icon="add" data-testid="composition-add" (click)="addAssessment.emit()">{{ copy.add }}</button>
      }
    </section>
  `,
  styleUrls: ['./weight-trend-card.component.scss', './composition-trend-card.component.scss'],
  imports: [FitnessButtonComponent, PointChartComponent, SegmentedControlComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompositionTrendCardComponent {
  readonly view = input.required<CompositionTrendView>();
  readonly range = model.required<WeightRange>();
  readonly metric = model<BodyCompositionMetric | null>(null);
  readonly openComposition = output<void>();
  readonly addAssessment = output<void>();

  protected readonly copy = WORKOUT_COPY.progress.composition;

  /** Shows the chosen value, keeping its chip in view (the row scrolls sideways). */
  protected choose(metric: BodyCompositionMetric, event: Event): void {
    this.metric.set(metric);
    (event.currentTarget as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  protected readonly ranges: readonly SegmentOption<WeightRange>[] = WEIGHT_RANGES.map((value) => ({
    value,
    label: WORKOUT_COPY.progress.weight.ranges[value],
    spoken: capitalize(WEIGHT_HISTORY_COPY.trend.rangeNames[value]),
  }));
}
