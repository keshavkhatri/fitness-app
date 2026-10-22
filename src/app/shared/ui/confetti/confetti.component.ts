import { ChangeDetectionStrategy, Component, input, numberAttribute } from '@angular/core';

const COLORS = ['#c5f36b', '#5f8f14', '#f2a516', '#f0607a', '#9b7bf0', '#2f7cf6', '#f5f4ee'];

interface Piece {
  readonly left: number;
  readonly dx: string;
  readonly dy: string;
  readonly r: string;
  readonly delay: string;
  readonly color: string;
  readonly round: boolean;
}

/**
 * A one-time confetti burst for a celebration (a finished workout). Decorative only (hidden from assistive tech),
 * pure CSS, and gone under reduced motion. Place it inside a positioned element; it doesn't take any space.
 */
@Component({
  selector: 'fit-confetti',
  template: `
    @for (p of pieces; track $index) {
      <span
        class="piece"
        [class.round]="p.round"
        [style.left.%]="p.left"
        [style.--dx]="p.dx"
        [style.--dy]="p.dy"
        [style.--r]="p.r"
        [style.animation-delay]="p.delay"
        [style.background]="p.color"
      ></span>
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      overflow: visible;
      pointer-events: none;
    }

    .piece {
      position: absolute;
      top: 30%;
      width: 7px;
      height: 11px;
      border-radius: 2px;
      opacity: 0;
      animation: fit-confetti 1400ms cubic-bezier(0.2, 0.6, 0.4, 1) both;
    }

    .round {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        display: none;
      }
    }
  `,
  host: { 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfettiComponent {
  readonly count = input(36, { transform: numberAttribute });

  /** Spread around the middle, flying up and out, then falling. Fixed per instance (no re-randomizing). */
  protected readonly pieces: readonly Piece[] = Array.from({ length: 36 }, (_, i) => {
    const angle = (i / 36) * Math.PI * 2;
    const spread = 60 + Math.random() * 110;
    return {
      left: 50 + Math.cos(angle) * 6,
      dx: `${Math.round(Math.cos(angle) * spread)}px`,
      dy: `${Math.round(Math.sin(angle) * spread * 0.6 + 90 + Math.random() * 80)}px`,
      r: `${Math.round(360 + Math.random() * 540) * (i % 2 ? 1 : -1)}deg`,
      delay: `${Math.round(Math.random() * 180)}ms`,
      color: COLORS[i % COLORS.length],
      round: i % 3 === 0,
    };
  });
}
