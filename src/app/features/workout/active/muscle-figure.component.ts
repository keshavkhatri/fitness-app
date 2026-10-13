import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { MuscleGroup } from '../../../domain/workout-programming';

/** Simple front-view regions (viewBox 0 0 60 130); back muscles are shown where they show from the front. */
type Shape = { readonly kind: 'ellipse'; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number } | { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number };
const pair = (cx: number, cy: number, rx: number, ry: number): Shape[] => [
  { kind: 'ellipse', cx, cy, rx, ry },
  { kind: 'ellipse', cx: 60 - cx, cy, rx, ry },
];

const REGIONS: Readonly<Record<MuscleGroup, readonly Shape[]>> = {
  chest: pair(24.5, 33, 5.6, 4.4),
  lats: pair(20.5, 43, 2.6, 6.5),
  'upper-back': [{ kind: 'rect', x: 24, y: 23.5, w: 12, h: 4 }],
  'front-delts': pair(17, 28, 3.6, 3.8),
  'side-delts': pair(15.5, 28.5, 3.4, 3.8),
  'rear-delts': pair(16.5, 28.5, 3.2, 3.6),
  biceps: pair(13.4, 40, 2.6, 6),
  triceps: pair(12.6, 41, 2.4, 6),
  forearms: pair(10.6, 55, 2.3, 6.6),
  abs: [{ kind: 'rect', x: 25.5, y: 39, w: 9, h: 20 }],
  obliques: pair(22.3, 50, 2.2, 6.5),
  'lower-back': pair(23.5, 58, 2.6, 3.4),
  glutes: pair(24.5, 67, 4.6, 3.6),
  quads: pair(25, 82, 4.2, 11),
  hamstrings: pair(25.5, 84, 3.6, 10),
  adductors: pair(28.4, 80, 1.6, 8),
  calves: pair(25, 107, 2.8, 8),
  cardiovascular: [],
};

/**
 * A small front-view body figure with the exercise's primary muscles
 * highlighted, like an anatomy chart. Decorative (the muscles are named in
 * text next to it), so it is hidden from assistive tech.
 */
@Component({
  selector: 'app-muscle-figure',
  template: `
    <svg viewBox="0 0 60 130" aria-hidden="true" focusable="false">
      <g class="body">
        <circle cx="30" cy="10" r="6.5" />
        <rect x="27" y="15" width="6" height="6" rx="2" />
        <path d="M17 23 Q30 19 43 23 L45 30 Q42 46 39 60 L40 70 Q30 74 20 70 L21 60 Q18 46 15 30 Z" />
        <path d="M15 25 Q10 27 10.5 36 L9.5 48 Q7.5 56 8.5 64 L12.5 64 Q13.5 56 15 48 L17 36 Z" />
        <path d="M45 25 Q50 27 49.5 36 L50.5 48 Q52.5 56 51.5 64 L47.5 64 Q46.5 56 45 48 L43 36 Z" />
        <path d="M20 69 Q19 84 21 96 L21.5 104 Q20 114 22 124 L27 124 Q28 112 28 104 L29 92 L29.5 71 Z" />
        <path d="M40 69 Q41 84 39 96 L38.5 104 Q40 114 38 124 L33 124 Q32 112 32 104 L31 92 L30.5 71 Z" />
      </g>
      <g class="worked">
        @for (shape of shapes(); track $index) {
          @if (shape.kind === 'ellipse') {
            <ellipse [attr.cx]="shape.cx" [attr.cy]="shape.cy" [attr.rx]="shape.rx" [attr.ry]="shape.ry" />
          } @else {
            <rect [attr.x]="shape.x" [attr.y]="shape.y" [attr.width]="shape.w" [attr.height]="shape.h" rx="2.5" />
          }
        }
      </g>
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .body {
      fill: color-mix(in srgb, var(--color-text) 14%, transparent);
      stroke: color-mix(in srgb, var(--color-text) 30%, transparent);
      stroke-width: 0.6;
    }

    .worked {
      fill: var(--color-train);
      opacity: 0.85;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MuscleFigureComponent {
  readonly muscles = input<readonly MuscleGroup[]>([]);
  protected readonly shapes = computed(() => this.muscles().flatMap((m) => REGIONS[m] ?? []));
}
