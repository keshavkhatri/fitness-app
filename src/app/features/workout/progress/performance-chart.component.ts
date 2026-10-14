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
        <!-- A guide from the latest point to the axis, and its value beside it. -->
        <line class="guide" [attr.x1]="c.latest.x" [attr.x2]="c.latest.x" [attr.y1]="c.latest.y" [attr.y2]="size.height - size.bottom" />
        @for (p of c.points; track p.key; let last = $last) {
          <circle class="point" [class.latest]="last" [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="last ? 5.5 : 3.5" data-testid="performance-point" />
        }
        @for (x of c.xLabels; track x.anchor) {
          <text class="date" [attr.x]="x.x" [attr.y]="size.height - 6" [attr.text-anchor]="x.anchor">{{ x.label }}</text>
        }
        <g class="callout" [attr.transform]="'translate(' + calloutX(c.latest.x) + ' ' + calloutY(c.latest.y) + ')'" data-testid="performance-latest">
          <rect [attr.width]="calloutWidth" height="36" rx="8" />
          <text class="callout-value" [attr.x]="calloutWidth / 2" y="16" text-anchor="middle">{{ c.latest.value }}</text>
          <text class="callout-date" [attr.x]="calloutWidth / 2" y="29" text-anchor="middle">{{ c.latest.date }}</text>
        </g>
      </svg>
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
  protected readonly calloutWidth = 76;

  /** Left of the point (it is usually at the right edge), never past the plot's left edge. */
  protected calloutX(x: number): number {
    return Math.max(this.size.left, x - this.calloutWidth - 8);
  }

  /** Above the point, or below it near the top. */
  protected calloutY(y: number): number {
    return y - 46 < 0 ? y + 10 : y - 46;
  }
}
