import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';

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
      @if (area() && c.path) {
        <defs>
          <linearGradient [attr.id]="areaId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" class="area-top" />
            <stop offset="1" class="area-bottom" />
          </linearGradient>
        </defs>
        <polygon [attr.points]="areaPoints()" [attr.fill]="'url(#' + areaId + ')'" />
      }
      @if (c.path) {
        <polyline class="line" [attr.points]="c.path" data-testid="weight-chart-line" />
      }
      @for (point of c.points; track point.key; let last = $last) {
        <circle class="point" [class.latest]="last" [attr.cx]="point.x" [attr.cy]="point.y" [attr.r]="last ? 5.5 : 4" data-testid="weight-chart-point" />
      }
      @for (x of c.xLabels; track x.anchor) {
        <text class="date" [attr.x]="x.x" [attr.y]="size.height - 8" [attr.text-anchor]="x.anchor">{{ x.label }}</text>
      }
      @if (callout(); as label) {
        @let p = c.points[c.points.length - 1];
        <!-- The latest value, beside its point (to the left: the latest point is at the right edge). -->
        <g class="callout" [attr.transform]="'translate(' + (p.x - 72) + ' ' + calloutY(p.y) + ')'" data-testid="weight-chart-callout">
          <rect width="64" height="34" rx="8" />
          <text class="callout-value" x="32" y="15" text-anchor="middle">{{ label.value }}</text>
          <text class="callout-date" x="32" y="28" text-anchor="middle">{{ label.date }}</text>
        </g>
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

    .area-top {
      stop-color: var(--color-primary);
      stop-opacity: 0.22;
    }

    .area-bottom {
      stop-color: var(--color-primary);
      stop-opacity: 0;
    }

    .callout rect {
      fill: var(--color-surface);
      stroke: var(--color-border);
    }

    .callout-value {
      fill: var(--color-text);
      font-family: inherit;
      font-size: 12px;
      font-weight: 700;
    }

    .callout-date {
      fill: var(--color-text-secondary);
      font-family: inherit;
      font-size: 10px;
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

  /** A soft fill under the line (decorative). */
  readonly area = input(false, { transform: booleanAttribute });
  /** The latest value shown beside its point; null for none. */
  readonly callout = input<{ readonly value: string; readonly date: string } | null>(null);

  protected readonly size = CHART;
  private static next = 0;
  protected readonly areaId = `weight-area-${WeightChartComponent.next++}`;

  /** The line closed down to the bottom of the plot. */
  protected readonly areaPoints = computed(() => {
    const points = this.chart().points;
    const base = CHART.height - CHART.bottom;
    return `${points[0].x},${base} ${this.chart().path} ${points[points.length - 1].x},${base}`;
  });

  /** Above the point, or below it when it is near the top. */
  protected calloutY(y: number): number {
    return y - 44 < CHART.top ? y + 10 : y - 44;
  }
}
