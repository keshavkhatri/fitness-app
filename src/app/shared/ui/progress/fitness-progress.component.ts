import { ChangeDetectionStrategy, Component, computed, input, numberAttribute } from '@angular/core';

import { FitnessTone } from '../tone';

export type FitnessProgressVariant = 'bar' | 'ring';

const RING_RADIUS = 15.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Accessible progress indicator (linear bar or ring).
 * Ring content (e.g. a centred number) can be projected. It is decorative
 * for assistive tech, so pass `valueText` to describe the value.
 */
@Component({
  selector: 'fit-progress',
  template: `
    @if (variant() === 'ring') {
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle class="track" cx="18" cy="18" [attr.r]="radius" />
        <!-- Skipped at 0% so the round line cap doesn't render a stray dot. -->
        @if (fraction() > 0) {
          <circle
            class="fill"
            cx="18"
            cy="18"
            [attr.r]="radius"
            [attr.stroke-dasharray]="circumference"
            [attr.stroke-dashoffset]="dashOffset()"
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
    '[style.--ring-size.px]': 'ringSize()',
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

  protected readonly radius = RING_RADIUS;
  protected readonly circumference = RING_CIRCUMFERENCE;

  protected readonly fraction = computed(() => {
    const max = this.max();
    if (max <= 0) {
      return 0;
    }
    return Math.min(Math.max(this.value() / max, 0), 1);
  });

  /** `aria-valuenow` must stay within [0, max] even when the raw value overshoots. */
  protected readonly valueNow = computed(() => Math.min(Math.max(this.value(), 0), Math.max(this.max(), 0)));

  protected readonly dashOffset = computed(() => RING_CIRCUMFERENCE * (1 - this.fraction()));
}
