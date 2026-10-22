import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { PointChartComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { PerformanceChartView } from './exercise-performance-view-model';

/**
 * One recorded value per session, as a labelled point chart: every session's value above its point and its date
 * below, the latest highlighted (no smoothing or forecasts). One labelled image plus the same values as text. Empty
 * ranges say so instead of drawing an empty chart.
 */
@Component({
  selector: 'app-performance-chart',
  template: `
    @if (chart(); as c) {
      <fit-point-chart [points]="c.points" [label]="label()" [caption]="c.unit" [unit]="c.unit" [minSpan]="c.minSpan" data-testid="performance-chart" />
      @if (c.points.length === 1) {
        <p class="note">{{ copy.onlyOne }}</p>
      }
    } @else {
      <p class="note" data-testid="performance-chart-empty">{{ copy.emptyRange }}</p>
    }
  `,
  styleUrl: './performance-chart.component.scss',
  imports: [PointChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerformanceChartComponent {
  /** Null when the range has no charted value. */
  readonly chart = input.required<PerformanceChartView | null>();
  readonly label = input.required<string>();

  protected readonly copy = WORKOUT_COPY.progress.detail;
}
