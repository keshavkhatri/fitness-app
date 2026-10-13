import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { WORKOUT_COPY } from '../workout-content';
import { PERFORMANCE_CHART, PerformanceChartView } from './exercise-performance-view-model';

/**
 * One recorded value per session as a small static SVG: points joined in
 * date order (no smoothing or forecasts), the latest larger and filled, and
 * its value in text. The SVG is one labelled image (a sentence describing
 * the range). Empty ranges say so instead of drawing an empty axis.
 */
@Component({
  selector: 'app-performance-chart',
  template: `
    @if (chart(); as c) {
      <p class="axis-unit" aria-hidden="true">{{ c.unit }}</p>
      <svg class="chart" [attr.viewBox]="'0 0 ' + size.width + ' ' + size.height" role="img" [attr.aria-label]="label()" focusable="false" data-testid="performance-chart">
        <g class="grid">
          @for (tick of c.yTicks; track tick.label) {
            <line [attr.x1]="size.left" [attr.x2]="size.width - size.right" [attr.y1]="tick.y" [attr.y2]="tick.y" />
            <text class="tick" [attr.x]="size.left - 6" [attr.y]="tick.y + 4" text-anchor="end">{{ tick.label }}</text>
          }
        </g>
        @if (c.path) {
          <polyline class="line" [attr.points]="c.path" />
        }
        @for (p of c.points; track p.key; let last = $last) {
          <circle class="point" [class.latest]="last" [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="last ? 5.5 : 3.5" data-testid="performance-point" />
        }
        @for (x of c.xLabels; track x.anchor) {
          <text class="date" [attr.x]="x.x" [attr.y]="size.height - 6" [attr.text-anchor]="x.anchor">{{ x.label }}</text>
        }
      </svg>
      <p class="latest" data-testid="performance-latest">
        <span class="latest-value">{{ c.latest.value }}</span>&ngsp;<span class="latest-date">{{ c.latest.date }}</span>
      </p>
      @if (c.points.length === 1) {
        <p class="note">{{ copy.onlyOne }}</p>
      }
    } @else {
      <p class="note" data-testid="performance-chart-empty">{{ copy.emptyRange }}</p>
    }
  `,
  styleUrl: './performance-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerformanceChartComponent {
  /** Null when the range has no charted value. */
  readonly chart = input.required<PerformanceChartView | null>();
  readonly label = input.required<string>();

  protected readonly copy = WORKOUT_COPY.progress.detail;
  protected readonly size = PERFORMANCE_CHART;
}
