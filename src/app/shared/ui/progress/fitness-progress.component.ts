import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, numberAttribute } from '@angular/core';

import { FitnessTone } from '../tone';

export type FitnessProgressVariant = 'bar' | 'ring';

let nextGradientId = 0;
/** The ring's viewBox is 36 × 36; the stroke stays inside it at any thickness. */
const RING_CENTER = 18;

/**
 * Accessible progress indicator (linear bar or ring). It fills up from empty when it first appears, and slides
 * to new values after that (docs/motion-plan.md #4).
 * Ring content (e.g. a centred number) can be projected. It is decorative
 * for assistive tech, so pass `valueText` to describe the value.
 */
@Component({
  selector: 'fit-progress',
  template: `
    @if (variant() === 'ring') {
      <svg viewBox="0 0 36 36" aria-hidden="true">
        @if (gradient()) {
          <defs>
            <linearGradient [attr.id]="gradientId" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0" class="stop-start" />
              <stop offset="1" class="stop-end" />
            </linearGradient>
          </defs>
        }
        <circle class="track" cx="18" cy="18" [attr.r]="radius()" />
        <!-- Skipped at 0% so the round line cap doesn't render a stray dot. -->
        @if (fraction() > 0) {
          <circle
            class="fill"
            cx="18"
            cy="18"
            [attr.r]="radius()"
            [attr.stroke-dasharray]="circumference()"
            [style.--ring-empty]="circumference()"
            [attr.stroke-dashoffset]="dashOffset()"
            [attr.stroke]="gradient() ? 'url(#' + gradientId + ')' : null"
          />
        }
      </svg>
      <div class="center"><ng-content /></div>
    } @else {
      <div class="track"><div class="fill" [style.width.%]="fraction() * 100"></div></div>
    }
  `,
  styleUrl: './fitness-progress.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'progressbar',
    'aria-valuemin': '0',
    '[attr.aria-valuemax]': 'max()',
    '[attr.aria-valuenow]': 'valueNow()',
    '[attr.aria-valuetext]': 'valueText() ?? null',
    '[attr.aria-label]': 'label()',
    '[attr.data-variant]': 'variant()',
    '[attr.data-tone]': 'tone()',
    '[class.gradient]': 'gradient()',
    // `ringSize` is the size in px at normal text; it grows with the user's text size (see
    // core/text-scale) so the figures inside a ring never outgrow it.
    '[style.--ring-size]': `'calc(' + ringSize() + 'px * var(--text-scale, 1))'`,
    '[style.--ring-thickness]': 'thickness()',
    // Staggers the fill-up when several appear together (e.g. the macro rings).
    '[style.--fill-delay]': "enterDelay() + 'ms'",
  },
})
export class FitnessProgressComponent {
  readonly value = input.required({ transform: numberAttribute });
  readonly max = input(100, { transform: numberAttribute });
  /** Accessible name, e.g. "Protein". */
  readonly label = input.required<string>();
  /** Accessible value description, e.g. "96 of 150 grams". */
  readonly valueText = input<string>();
  readonly variant = input<FitnessProgressVariant>('bar');
  readonly tone = input<Exclude<FitnessTone, 'neutral'>>('primary');
  readonly ringSize = input(72, { transform: numberAttribute });
  /** Brand gradient fill (lime into its accessible strong shade); primary tone only. */
  readonly gradient = input(false, { transform: booleanAttribute });
  /** Stroke width in viewBox units (36 = the ring's size; up to 8). */
  readonly thickness = input(3.5, { transform: numberAttribute });
  /** Delay (ms) before the fill-up when it first appears. */
  readonly enterDelay = input(0, { transform: numberAttribute });

  protected readonly gradientId = `fit-progress-gradient-${nextGradientId++}`;

  // 0.75 inset keeps the default (3.5) at its original radius of 15.5.
  protected readonly radius = computed(() => RING_CENTER - Math.min(Math.max(this.thickness(), 1), 8) / 2 - 0.75);
  protected readonly circumference = computed(() => 2 * Math.PI * this.radius());

  protected readonly fraction = computed(() => {
    const max = this.max();
    if (max <= 0) {
      return 0;
    }
    return Math.min(Math.max(this.value() / max, 0), 1);
  });

  /** `aria-valuenow` must stay within [0, max] even when the raw value overshoots. */
  protected readonly valueNow = computed(() => Math.min(Math.max(this.value(), 0), Math.max(this.max(), 0)));

  protected readonly dashOffset = computed(() => this.circumference() * (1 - this.fraction()));
}
