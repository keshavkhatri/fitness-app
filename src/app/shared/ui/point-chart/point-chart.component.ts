import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, numberAttribute, signal } from '@angular/core';

import { PointChartPoint, pointChartLayout } from './point-chart-layout';

let nextId = 0;

/**
 * Readings as a labelled line chart, the way a device shows its history: every point with its value above it and
 * its date below, evenly spaced, the latest highlighted. It always fits its card (no sideways scrolling): with more
 * readings than labels fit, all are drawn and the first, latest, highest, lowest and evenly spaced ones are labelled;
 * a tap on any point shows its value. The drawing is one labelled image, and every reading is listed as text for
 * screen readers.
 */
@Component({
  selector: 'fit-point-chart',
  template: `
    @let l = layout();
    @if (caption()) {
      <p class="caption" aria-hidden="true">{{ caption() }}</p>
    }
    <div class="frame">
      <svg
        class="chart"
        [attr.viewBox]="'0 0 ' + l.width + ' ' + l.height"
        [style.width]="l.width + 'px'"
        (click)="select(null)"
        (keydown.escape)="select(null)"
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
          @if (p.labelled || p.key === selected()) {
            <line class="guide" [attr.x1]="p.x" [attr.x2]="p.x" [attr.y1]="l.guideTop" [attr.y2]="l.baseline" />
          }
        }
        <line class="baseline" [attr.x1]="l.points[0]?.x ?? 0" [attr.x2]="l.points[l.points.length - 1]?.x ?? 0" [attr.y1]="l.baseline" [attr.y2]="l.baseline" />
        @if (l.path) {
          <polygon class="area" [attr.points]="areaPoints()" [attr.fill]="'url(#' + areaId + ')'" />
          <polyline class="line" pathLength="1" [attr.points]="l.path" data-testid="chart-line" />
        }
        @for (p of l.points; track p.key; let last = $last, i = $index) {
          @let shown = p.labelled && (!selected() || !nearSelected(p));
          <circle
            class="point"
            [style.--i]="i"
            [class.latest]="last"
            [class.minor]="!p.labelled"
            [class.selected]="p.key === selected()"
            [attr.cx]="p.x"
            [attr.cy]="p.y"
            [attr.r]="last || p.key === selected() ? 6 : p.labelled ? 4.5 : 3"
            data-testid="chart-point"
          />
          <!-- A generous tap target: a tap shows this reading's value and date. -->
          <circle class="hit" [attr.cx]="p.x" [attr.cy]="p.y" r="16" (click)="select(p.key); $event.stopPropagation()" />
          @if (shown) {
            <text class="value" [class.latest]="last" [attr.x]="p.x" [attr.y]="p.y - l.valueOffset" text-anchor="middle" data-testid="chart-value">{{ p.valueText }}</text>
          }
          @if ((p.labelled && !(selected() && p.key !== selected() && nearSelected(p))) || p.key === selected()) {
            <text class="date" [class.latest]="last" [class.selected]="p.key === selected()" [attr.x]="p.x" [attr.y]="l.dateY" text-anchor="middle" data-testid="chart-date">{{ p.date }}</text>
            @if (p.detail) {
              <text class="detail" [attr.x]="p.x" [attr.y]="l.detailY" text-anchor="middle">{{ p.detail }}</text>
            }
          }
        }
        @if (selectedPoint(); as s) {
          <!-- The tapped reading, above its point. -->
          <g class="bubble" [attr.transform]="'translate(' + bubbleX(s.x, l.width) + ' ' + bubbleY(s.y) + ')'" data-testid="chart-selected">
            <rect width="68" height="30" rx="8" />
            <text class="bubble-value" x="34" y="19" text-anchor="middle">{{ s.valueText }}</text>
          </g>
        }
      </svg>
    </div>
    @if (l.thinned) {
      <p class="hint" aria-hidden="true">Tap a point to see its value</p>
    }
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
  /** The tapped reading (with more readings than labels, the unlabelled ones are reached this way). */
  protected readonly selected = signal<string | null>(null);
  protected readonly selectedPoint = computed(() => this.layout().points.find((p) => p.key === this.selected()) ?? null);

  /** The card's width, so the chart fills it (measured; a default until then). */
  private readonly available = signal<number | undefined>(undefined);
  protected readonly layout = computed(() => pointChartLayout(this.points(), this.minSpan(), this.available()));
  protected readonly areaPoints = computed(() => {
    const l = this.layout();
    const first = l.points[0];
    const last = l.points[l.points.length - 1];
    return `${first.x},${l.baseline} ${l.path} ${last.x},${l.baseline}`;
  });

  private readonly destroyRef = inject(DestroyRef);

  protected select(key: string | null): void {
    this.selected.set(key === this.selected() ? null : key);
  }

  /** A printed label that would sit under the tapped reading's bubble is hidden while it shows. */
  protected nearSelected(p: { readonly x: number; readonly key: string }): boolean {
    const s = this.selectedPoint();
    return !!s && Math.abs(s.x - p.x) < 40;
  }

  protected bubbleX(x: number, width: number): number {
    return Math.min(width - 70, Math.max(2, x - 34));
  }

  protected bubbleY(y: number): number {
    return Math.max(0, y - 42);
  }

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
  }
}
