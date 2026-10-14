import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { MEASUREMENT_CHART, MeasurementChartView } from '../measurement-chart';

/**
 * Recorded circumferences as lines, one per site. Each site has its own
 * colour and marker shape (circle, square, diamond, triangle, ring), so they
 * stay apart without colour. The drawing is one labelled image; the same
 * readings are listed as text for screen readers.
 */
@Component({
  selector: 'app-measurement-chart',
  template: `
    @let c = chart();
    <p class="axis-unit" aria-hidden="true">{{ c.unit }}</p>
    <svg class="chart" [attr.viewBox]="'0 0 ' + size.width + ' ' + size.height" role="img" [attr.aria-label]="label()" focusable="false" data-testid="measurement-chart">
      <g class="grid">
        @for (tick of c.yTicks; track tick.label) {
          <line [attr.x1]="size.left" [attr.x2]="size.width - size.right" [attr.y1]="tick.y" [attr.y2]="tick.y" />
          <text class="tick" [attr.x]="size.left - 6" [attr.y]="tick.y + 4" text-anchor="end">{{ tick.label }}</text>
        }
      </g>
      @for (s of c.series; track s.site) {
        <g [attr.class]="'series s' + s.index" [attr.data-site]="s.site">
          @if (s.path) {
            <polyline class="line" [attr.points]="s.path" />
          }
          @for (p of s.points; track p.key) {
            @switch (s.index) {
              @case (1) {
                <rect class="mark" [attr.x]="p.x - 4" [attr.y]="p.y - 4" width="8" height="8" />
              }
              @case (2) {
                <rect class="mark" [attr.x]="p.x - 3.5" [attr.y]="p.y - 3.5" width="7" height="7" [attr.transform]="'rotate(45 ' + p.x + ' ' + p.y + ')'" />
              }
              @case (3) {
                <polygon class="mark" [attr.points]="(p.x) + ',' + (p.y - 5) + ' ' + (p.x + 5) + ',' + (p.y + 4) + ' ' + (p.x - 5) + ',' + (p.y + 4)" />
              }
              @case (4) {
                <circle class="mark hollow" [attr.cx]="p.x" [attr.cy]="p.y" r="4" />
              }
              @default {
                <circle class="mark" [attr.cx]="p.x" [attr.cy]="p.y" r="4.5" />
              }
            }
          }
        </g>
      }
      @for (x of c.xLabels; track $index) {
        <text class="date" [attr.x]="x.x" [attr.y]="size.height - 6" [attr.text-anchor]="x.anchor">{{ x.label }}</text>
      }
    </svg>
    <ul class="visually-hidden" [attr.aria-label]="listLabel()">
      @for (s of c.series; track s.site) {
        <li>{{ s.spoken }}</li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    .axis-unit {
      font-size: var(--font-size-caption);
      color: var(--color-text-secondary);
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
    .tick,
    .date {
      font-size: 10px;
      fill: var(--color-text-secondary);
    }
    .line {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .mark {
      fill: currentColor;
    }
    .mark.hollow {
      fill: var(--color-surface);
      stroke: currentColor;
      stroke-width: 2;
    }
    .s0 {
      color: var(--color-primary-strong);
    }
    .s1 {
      color: var(--color-warning-text);
    }
    .s2 {
      color: var(--color-text);
    }
    .s3 {
      color: var(--color-danger-text);
    }
    .s4 {
      color: var(--color-text-secondary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MeasurementChartComponent {
  readonly chart = input.required<MeasurementChartView>();
  /** The image's accessible name ("Measurements over the last 90 days"). */
  readonly label = input.required<string>();
  readonly listLabel = input('Readings in this range');

  protected readonly size = MEASUREMENT_CHART;
}
