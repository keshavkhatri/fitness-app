import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  numberAttribute,
  output,
} from '@angular/core';

import { RulerScale, RulerTick, releaseVelocity, snapToTick, stepFrom, tickIndex, valueAfterDrag, valueAtOffset, visibleTicks } from './ruler-math';

export type RulerOrientation = 'horizontal' | 'vertical';

/** A pointer that moved less than this between down and up was a tap. */
const TAP_SLOP_PX = 6;
/** Below this release speed (px/ms) the scale just settles on the nearest tick. */
const FLING_MIN_SPEED = 0.25;
/** Per-millisecond speed decay of a flick. */
const FLING_DECAY = 0.995;
const SETTLE_MS = 160;

interface Drag {
  readonly pointerId: number;
  readonly start: number;
  readonly startValue: number;
  moved: boolean;
  readonly samples: { t: number; p: number }[];
}

/**
 * A ruler for picking a number by dragging a scale under a fixed marker:
 * horizontal (higher values to the right) or vertical (higher values up).
 *
 * - Drag with touch, pen or mouse; a flick keeps it moving, then it settles
 *   on the nearest tick. It always stops on a tick.
 * - Tap or click a tick to pick it.
 * - Keyboard (it is an ARIA slider): arrows move one step, Page Up/Down one
 *   major division, Home/End to the ends. The mouse wheel moves one step.
 *
 * `value` may sit between ticks (e.g. 172.5 cm read from a report): it is
 * shown exactly and is only snapped once the user moves the ruler.
 * `valueChange` emits tick values only, each time a new one reaches the
 * marker. Only the ticks near the marker are drawn, so long fine scales
 * (20–500 kg in 0.1 kg) stay cheap.
 *
 * Projected content is placed over the marker (e.g. a readout).
 */
@Component({
  selector: 'fit-ruler',
  template: `
    <div class="scale" aria-hidden="true">
      @for (tick of ticks(); track tick.index) {
        <span
          class="tick"
          [class.major]="tick.major"
          [class.mid]="tick.mid"
          [class.current]="tick.index === currentIndex()"
          [style.--offset]="offsetOf(tick)"
        >
          @if (tick.labelled) {
            <span class="label">{{ format()(tick.value) }}</span>
          }
        </span>
      }
    </div>
    <span class="marker" aria-hidden="true"></span>
    <ng-content />
  `,
  styleUrl: './ruler.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'slider',
    tabindex: '0',
    '[attr.data-orientation]': 'orientation()',
    '[attr.aria-orientation]': 'orientation()',
    '[attr.aria-label]': 'label()',
    '[attr.aria-valuemin]': 'min()',
    '[attr.aria-valuemax]': 'max()',
    '[attr.aria-valuenow]': 'value()',
    '[attr.aria-valuetext]': 'valueText()(value())',
    '(pointerdown)': 'pointerDown($event)',
    '(pointermove)': 'pointerMove($event)',
    '(pointerup)': 'pointerUp($event)',
    '(pointercancel)': 'pointerCancel($event)',
    '(lostpointercapture)': 'pointerCancel($event)',
    '(keydown)': 'keyDown($event)',
    '(wheel)': 'wheel($event)',
  },
})
export class RulerComponent {
  readonly value = input.required<number>();
  readonly min = input.required({ transform: numberAttribute });
  readonly max = input.required({ transform: numberAttribute });
  readonly step = input(1, { transform: numberAttribute });
  readonly orientation = input<RulerOrientation>('horizontal');
  /** Accessible name, e.g. "Height". */
  readonly label = input.required<string>();
  /** Tick spacing on screen. */
  readonly pxPerStep = input(10, { transform: numberAttribute });
  /** Every n-th tick is long (counted from zero, so on round values). */
  readonly majorEvery = input(10, { transform: numberAttribute });
  /** Every n-th tick carries a label. */
  readonly labelEvery = input(10, { transform: numberAttribute });
  /** Tick label text. */
  readonly format = input<(value: number) => string>(String);
  /** Spoken value, e.g. "179 centimeters". */
  readonly valueText = input<(value: number) => string>(String);

  readonly valueChange = output<number>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly scale = computed<RulerScale>(() => ({ min: this.min(), max: this.max(), step: this.step() }));

  /** True while a drag, flick or settle owns the position. */
  private interacting = false;
  private drag: Drag | null = null;
  private frame: number | null = null;
  private lastEmitted: number | null = null;

  /** The value under the marker: follows `value`, and moves freely (unsnapped) while dragged. */
  protected readonly position = linkedSignal<number, number>({
    source: () => this.value(),
    computation: (value, previous) => (this.interacting && previous ? previous.value : value),
  });
  protected readonly currentIndex = computed(() => tickIndex(this.position(), this.scale()));
  /** Enough ticks to cover ~300 px either side of the marker. */
  protected readonly ticks = computed(() =>
    visibleTicks(this.position(), Math.ceil(300 / this.pxPerStep()) + 1, this.scale(), this.majorEvery(), this.labelEvery()),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopMotion());
  }

  /** Pixels from the marker along the ruler (down/right positive). */
  protected offsetOf(tick: RulerTick): number {
    const px = ((tick.value - this.position()) / this.step()) * this.pxPerStep();
    return this.orientation() === 'vertical' ? -px : px;
  }

  // --- Pointer ----------------------------------------------------------------------------------

  protected pointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    this.stopMotion();
    this.interacting = true;
    try {
      // Keeps the drag when the pointer leaves the ruler. Can fail for a pointer that is already gone.
      this.host.setPointerCapture?.(event.pointerId);
    } catch {
      // The drag still works while the pointer stays over the ruler.
    }
    const p = this.coordinate(event);
    this.drag = { pointerId: event.pointerId, start: p, startValue: this.position(), moved: false, samples: [{ t: event.timeStamp, p }] };
  }

  protected pointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const p = this.coordinate(event);
    if (!drag.moved && Math.abs(p - drag.start) < TAP_SLOP_PX) {
      return;
    }
    drag.moved = true;
    drag.samples.push({ t: event.timeStamp, p });
    if (drag.samples.length > 8) {
      drag.samples.shift();
    }
    this.moveTo(valueAfterDrag(drag.startValue, p - drag.start, this.pxPerStep(), this.scale()));
  }

  protected pointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    this.drag = null;
    // The release counts too: a drag that stopped before letting go doesn't fling.
    drag.samples.push({ t: event.timeStamp, p: this.coordinate(event) });
    if (!drag.moved) {
      // A tap: pick the tick under the pointer.
      const rect = this.host.getBoundingClientRect();
      const offset =
        this.orientation() === 'vertical' ? rect.top + rect.height / 2 - event.clientY : event.clientX - (rect.left + rect.width / 2);
      this.settle(valueAtOffset(this.position(), offset, this.pxPerStep(), this.scale()));
      return;
    }
    this.fling(releaseVelocity(drag.samples));
  }

  protected pointerCancel(event: PointerEvent): void {
    if (this.drag?.pointerId === event.pointerId) {
      this.drag = null;
      this.settle(snapToTick(this.position(), this.scale()));
    }
  }

  // --- Keyboard and wheel -----------------------------------------------------------------------

  protected keyDown(event: KeyboardEvent): void {
    const scale = this.scale();
    const current = this.position();
    let next: number;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        next = stepFrom(current, 1, scale);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        next = stepFrom(current, -1, scale);
        break;
      case 'PageUp':
        next = stepFrom(current, this.majorEvery(), scale);
        break;
      case 'PageDown':
        next = stepFrom(current, -this.majorEvery(), scale);
        break;
      case 'Home':
        next = scale.min;
        break;
      case 'End':
        next = scale.max;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.stopMotion();
    this.jumpTo(next);
  }

  protected wheel(event: WheelEvent): void {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : -event.deltaY;
    if (delta === 0) {
      return;
    }
    event.preventDefault();
    this.stopMotion();
    this.jumpTo(stepFrom(this.position(), Math.sign(delta), this.scale()));
  }

  // --- Motion -----------------------------------------------------------------------------------

  /** Moves the scale (unsnapped) and reports the tick now under the marker. */
  private moveTo(value: number): void {
    this.position.set(value);
    this.emit(snapToTick(value, this.scale()));
  }

  /** Straight to a tick, no animation. */
  private jumpTo(value: number): void {
    this.interacting = false;
    this.position.set(value);
    this.emit(value);
  }

  private fling(velocity: number): void {
    // Velocity is along the pointer axis; valueAfterDrag reads a positive delta as "show lower values".
    if (Math.abs(velocity) < FLING_MIN_SPEED || prefersReducedMotion()) {
      this.settle(snapToTick(this.position(), this.scale()));
      return;
    }
    let speed = velocity;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      const before = this.position();
      this.moveTo(valueAfterDrag(before, speed * dt, this.pxPerStep(), this.scale()));
      speed *= FLING_DECAY ** dt;
      const stuck = this.position() === before;
      if (Math.abs(speed) < 0.02 || stuck) {
        this.frame = null;
        this.settle(snapToTick(this.position(), this.scale()));
      } else {
        this.frame = requestAnimationFrame(tick);
      }
    };
    this.frame = requestAnimationFrame(tick);
  }

  /** Eases onto a tick, then hands the position back to `value`. */
  private settle(target: number): void {
    const from = this.position();
    if (prefersReducedMotion() || from === target) {
      this.jumpTo(target);
      return;
    }
    this.emit(target);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / SETTLE_MS);
      const eased = 1 - (1 - t) ** 3;
      if (t < 1) {
        this.position.set(from + (target - from) * eased);
        this.frame = requestAnimationFrame(tick);
      } else {
        this.frame = null;
        this.jumpTo(target);
      }
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stopMotion(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }

  /** Reports a tick once per arrival at the marker, and never the value already held. */
  private emit(value: number): void {
    if (value === this.lastEmitted) {
      return;
    }
    this.lastEmitted = value;
    if (value !== this.value()) {
      this.valueChange.emit(value);
    }
  }

  /**
   * Pointer position along the ruler, signed so that moving the pointer in
   * the positive direction brings lower values to the marker: rightwards on
   * a horizontal ruler, upwards on a vertical one (higher values are above).
   */
  private coordinate(event: PointerEvent): number {
    return this.orientation() === 'vertical' ? -event.clientY : event.clientX;
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
