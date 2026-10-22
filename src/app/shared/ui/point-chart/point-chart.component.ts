import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  input,
  numberAttribute,
  signal,
  viewChild,
} from '@angular/core';

import { PointChartPoint, pointChartLayout } from './point-chart-layout';

let nextId = 0;

/**
 * Readings as a labelled line chart, the way a device shows its history: every point with its value above it and
 * its date below, evenly spaced, the latest highlighted. With many readings it scrolls sideways (starting at the
 * newest). The drawing is one labelled image, and the same readings are listed as text for screen readers.
 */
@Component({
  selector: 'fit-point-chart',
  template: `
    @let l = layout();
    @if (caption()) {
      <p class="caption" aria-hidden="true">{{ caption() }}</p>
    }
    <div #scroller class="scroller" [class.scrolls]="l.scrolls">
      <svg
        class="chart"
        [attr.viewBox]="'0 0 ' + l.width + ' ' + l.height"
        [style.width]="l.width + 'px'"
        role="img"
        [attr.aria-label]="label()"
        focusable="false"
        data-testid="point-chart"
      >
        <defs>
          <linearGradient [attr.id]="areaId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" class="area-top" />
            <stop offset="1" class="area-bottom" />
          </linearGradient>
        </defs>
        @for (p of l.points; track p.key) {
          <line class="guide" [attr.x1]="p.x" [attr.x2]="p.x" [attr.y1]="l.guideTop" [attr.y2]="l.baseline" />
        }
        <line class="baseline" [attr.x1]="l.points[0]?.x ?? 0" [attr.x2]="l.points[l.points.length - 1]?.x ?? 0" [attr.y1]="l.baseline" [attr.y2]="l.baseline" />
        @if (l.path) {
          <polygon [attr.points]="areaPoints()" [attr.fill]="'url(#' + areaId + ')'" />
          <polyline class="line" [attr.points]="l.path" data-testid="chart-line" />
        }
        @for (p of l.points; track p.key; let last = $last) {
          <circle class="point" [class.latest]="last" [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="last ? 6 : 4.5" data-testid="chart-point" />
          <text class="value" [class.latest]="last" [attr.x]="p.x" [attr.y]="p.y - l.valueOffset" text-anchor="middle" data-testid="chart-value">{{ p.valueText }}</text>
          <text class="date" [class.latest]="last" [attr.x]="p.x" [attr.y]="l.dateY" text-anchor="middle" data-testid="chart-date">{{ p.date }}</text>
          @if (p.detail) {
            <text class="detail" [attr.x]="p.x" [attr.y]="l.detailY" text-anchor="middle">{{ p.detail }}</text>
          }
        }
      </svg>
    </div>
    <ul class="visually-hidden" [attr.aria-label]="listLabel()">
      @for (p of points(); track p.key) {
        <li>{{ p.date }}{{ p.detail ? ' ' + p.detail : '' }}: {{ p.valueText }}{{ unit() ? ' ' + unit() : '' }}</li>
      }
    </ul>
  `,
  styleUrl: './point-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PointChartComponent {
  /** Oldest first. */
  readonly points = input.required<readonly PointChartPoint[]>();
  /** The chart's accessible name: one sentence describing it. */
  readonly label = input.required<string>();
  /** Above the chart: "Weight (kg)". */
  readonly caption = input<string | null>(null);
  /** Spoken after each value in the text list ("kg"). */
  readonly unit = input('');
  readonly listLabel = input('Readings');
  /** The smallest value span drawn, so a small change doesn't look steep. */
  readonly minSpan = input(0, { transform: numberAttribute });

  protected readonly areaId = `fit-point-chart-area-${nextId++}`;
  /** The card's width, so the chart fills it (measured; a default until then). */
  private readonly available = signal<number | undefined>(undefined);
  protected readonly layout = computed(() => pointChartLayout(this.points(), this.minSpan(), this.available()));
  protected readonly areaPoints = computed(() => {
    const l = this.layout();
    const first = l.points[0];
    const last = l.points[l.points.length - 1];
    return `${first.x},${l.baseline} ${l.path} ${last.x},${l.baseline}`;
  });

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      const measure = () => {
        const width = host.clientWidth;
        if (width > 0 && width !== this.available()) {
          this.available.set(width);
        }
      };
      measure();
      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(measure);
        observer.observe(host);
        this.destroyRef.onDestroy(() => observer.disconnect());
      }
    });
    // A long history opens on the newest readings (the right end).
    afterRenderEffect(() => {
      this.layout();
      const el = this.scroller()?.nativeElement;
      if (el && el.scrollWidth > el.clientWidth) {
        el.scrollLeft = el.scrollWidth;
      }
    });
  }
}
