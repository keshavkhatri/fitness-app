import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';

interface Post {
  readonly x: number;
  readonly width: number;
  readonly opacity: number;
}

interface Dumbbell {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly angle: number;
  readonly blur: boolean;
}

/**
 * Workout photography: the bundled photo when there is one (`photo`), otherwise
 * (or if it fails to load) a generated stand-in: a dim gym (rack posts, floor
 * light) with dumbbells, laid out from a seed so each session looks a little
 * different but stays the same between visits. Decorative; theme colors only.
 */
@Component({
  selector: 'app-workout-art',
  template: `
    @if (photo() && photo() !== failed()) {
      <img
        class="photo"
        [src]="photo()"
        alt=""
        decoding="async"
        (error)="failed.set(photo())"
      />
    } @else {
      <svg
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <radialGradient [attr.id]="ids.light" cx="0.78" cy="0.12" r="0.75">
            <stop offset="0" class="light-core" />
            <stop offset="1" class="light-edge" />
          </radialGradient>
          <linearGradient [attr.id]="ids.plate" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" class="plate-hi" />
            <stop offset="0.55" class="plate-mid" />
            <stop offset="1" class="plate-lo" />
          </linearGradient>
          <linearGradient [attr.id]="ids.floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" class="floor-top" />
            <stop offset="1" class="floor-bottom" />
          </linearGradient>
          <filter
            [attr.id]="ids.blur"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <filter
            [attr.id]="ids.soft"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>

        <rect class="base" width="400" height="240" />
        <rect width="400" height="240" [attr.fill]="url(ids.light)" />

        <!-- Rack posts in the background, out of focus. -->
        <g [attr.filter]="url(ids.blur)">
          @for (p of scene().posts; track $index) {
            <rect
              class="post"
              [attr.x]="p.x"
              y="0"
              [attr.width]="p.width"
              height="190"
              [attr.opacity]="p.opacity"
            />
          }
          <rect
            class="post"
            x="0"
            y="58"
            width="400"
            height="5"
            opacity="0.08"
          />
          <rect
            class="post"
            x="0"
            y="122"
            width="400"
            height="4"
            opacity="0.06"
          />
        </g>

        <rect
          x="0"
          y="176"
          width="400"
          height="64"
          [attr.fill]="url(ids.floor)"
        />

        @for (d of scene().dumbbells; track $index) {
          <g
            [attr.transform]="
              'translate(' +
              d.x +
              ' ' +
              d.y +
              ') rotate(' +
              d.angle +
              ') scale(' +
              d.scale +
              ')'
            "
            [attr.filter]="d.blur ? url(ids.soft) : null"
          >
            <rect class="handle" x="-46" y="-5" width="92" height="10" rx="5" />
            @for (side of sides; track side) {
              <g [attr.transform]="'scale(' + side + ' 1)'">
                <rect
                  [attr.fill]="url(ids.plate)"
                  x="22"
                  y="-34"
                  width="18"
                  height="68"
                  rx="7"
                />
                <rect
                  [attr.fill]="url(ids.plate)"
                  x="38"
                  y="-28"
                  width="14"
                  height="56"
                  rx="6"
                />
                <rect
                  class="rim"
                  x="22"
                  y="-34"
                  width="18"
                  height="68"
                  rx="7"
                />
              </g>
            }
          </g>
        }
      </svg>
    }
  `,
  styleUrl: './workout-art.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkoutArtComponent {
  /** Any stable string (e.g. the session id). */
  readonly seed = input('');
  /** A bundled photo (assets/…); the generated art is drawn without one. */
  readonly photo = input<string | null>(null);
  /** The photo that failed to load (a later, different photo is tried again). */
  protected readonly failed = signal<string | null>(null);

  private static nextId = 0;
  private readonly n = WorkoutArtComponent.nextId++;
  protected readonly ids = {
    light: `wa-light-${this.n}`,
    plate: `wa-plate-${this.n}`,
    floor: `wa-floor-${this.n}`,
    blur: `wa-blur-${this.n}`,
    soft: `wa-soft-${this.n}`,
  };
  protected readonly sides = [1, -1] as const;

  protected readonly scene = computed(() => {
    const random = mulberry32(hash(this.seed()));
    const posts: Post[] = Array.from({ length: 7 }, (_, i) => ({
      x: 20 + i * 56 + random() * 24,
      width: 6 + random() * 10,
      opacity: 0.05 + random() * 0.07,
    }));
    const dumbbells: Dumbbell[] = [
      // The hero dumbbell, top right (where the reference's subject sits).
      {
        x: 300 + random() * 24,
        y: 70 + random() * 16,
        scale: 1.25,
        angle: -18 - random() * 14,
        blur: false,
      },
      // A second one further back.
      {
        x: 205 + random() * 30,
        y: 34 + random() * 14,
        scale: 0.72,
        angle: 8 + random() * 16,
        blur: true,
      },
    ];
    return { posts, dumbbells };
  });

  protected url(id: string): string {
    return `url(#${id})`;
  }
}

/** FNV-1a: a small, stable string hash. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

/** A tiny seeded PRNG (deterministic per seed). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
