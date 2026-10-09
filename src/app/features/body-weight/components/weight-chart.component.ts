import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { CHART, WeightChartView } from '../weight-trend-view-model';

/**
 * Recorded weights over time as a small static SVG: actual measurements as
 * points, joined in chronological order. No smoothing, averages, forecasts
 * or animation. The whole chart is one labelled image; the page lists the
 * same measurements as text.
 */
@Component({
  selector: 'app-weight-chart',
  template: `
    @let c = chart();
    <!-- Visual caption only: the SVG's accessible name already states the unit. -->
    <p class="axis-unit" aria-hidden="true">Weight ({{ c.unit }})</p>
    <svg
      class="chart"
      [attr.viewBox]="'0 0 ' + size.width + ' ' + size.height"
      role="img"
      [attr.aria-label]="label()"
      focusable="false"
      data-testid="weight-chart"
    >
      <g class="grid">
        @for (tick of c.yTicks; track tick.label) {
          <line [attr.x1]="size.left" [attr.x2]="size.width - size.right" [attr.y1]="tick.y" [attr.y2]="tick.y" />
          <text class="tick" [attr.x]="size.left - 6" [attr.y]="tick.y + 4" text-anchor="end">{{ tick.label }}</text>
        }
      </g>
      @if (c.path) {
        <polyline class="line" [attr.points]="c.path" data-testid="weight-chart-line" />
      }
      @for (point of c.points; track point.key; let last = $last) {
        <circle class="point" [class.latest]="last" [attr.cx]="point.x" [attr.cy]="point.y" [attr.r]="last ? 5.5 : 4" data-testid="weight-chart-point" />
      }
      @for (x of c.xLabels; track x.anchor) {
        <text class="date" [attr.x]="x.x" [attr.y]="size.height - 8" [attr.text-anchor]="x.anchor">{{ x.label }}</text>
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }

    .chart {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
    }

    .grid line {
      stroke: var(--color-border);
      stroke-width: 1;
    }

    .axis-unit {
      margin: 0 0 var(--space-1);
      font-size: var(--font-size-caption);
      line-height: var(--line-height-caption);
      color: var(--color-text-secondary);
    }

    .tick,
    .date {
      fill: var(--color-text-secondary);
      font-size: 11px;
      font-family: inherit;
      font-variant-numeric: tabular-nums;
    }

    .line {
      fill: none;
      stroke: var(--color-primary);
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-linecap: round;
    }

    .point {
      fill: var(--color-surface);
      stroke: var(--color-primary);
      stroke-width: 2;
    }

    // The latest point is larger and filled, so it doesn't rely on color alone.
    .point.latest {
      fill: var(--color-primary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeightChartComponent {
  readonly chart = input.required<WeightChartView>();
  /** Accessible name: a sentence describing the range. */
  readonly label = input.required<string>();

  protected readonly size = CHART;
}
