import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, model, signal, viewChild } from '@angular/core';
import { IonIcon, IonModal } from '@ionic/angular';

import { ExerciseDemonstration } from '../../../core/exercise-media/exercise-media';
import { FitnessButtonComponent } from '../../../shared/ui';
import {
  ZOOM_MIN,
  ZOOM_RESET,
  ZOOM_STEP,
  ZoomSize,
  ZoomState,
  distance,
  panBy,
  toggleZoom,
  zoomAt,
} from '../../../shared/ui/zoom/zoom-math';
import { WORKOUT_COPY } from '../workout-content';

const FRAME_MS = 1000;
const DOUBLE_TAP_MS = 300;
const KEY_PAN = 40;
const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * "How to do it" as a full-screen popup: the demonstration photos (played in
 * turn, with a pause control) or the guide sheet, which can be zoomed with a
 * pinch, a double tap, the wheel, the +/- buttons or the keyboard, and moved
 * by dragging once zoomed. Nothing is requested until it is opened.
 */
@Component({
  selector: 'app-demo-viewer',
  template: `
    <ion-modal class="demo-viewer" [isOpen]="open()" [attr.aria-label]="copy.title(name())" (didDismiss)="open.set(false)">
      <ng-template>
        @let d = demo();
        <div class="viewer" data-testid="demo-viewer">
          <header class="bar">
            <h2 class="title">{{ copy.title(name()) }}</h2>
            <button type="button" class="icon" data-testid="demo-close" [attr.aria-label]="copy.close" (click)="open.set(false)">
              <ion-icon name="close" aria-hidden="true" />
            </button>
          </header>

          @if (failed()) {
            <div class="failed" data-testid="demo-failed">
              <p>{{ copy.failed }}</p>
              <button fit-button type="button" variant="outline" (click)="retry()">{{ copy.retry }}</button>
            </div>
          } @else {
            <div
              #pad
              class="pad"
              tabindex="0"
              role="group"
              data-testid="demo-pad"
              [attr.aria-label]="copy.zoomHint"
              (pointerdown)="pointerDown($event)"
              (pointermove)="pointerMove($event)"
              (pointerup)="pointerUp($event)"
              (pointercancel)="pointerEnd($event)"
              (wheel)="wheel($event)"
              (keydown)="key($event)"
            >
              <div class="picture" [class.art]="d.artwork" [style.transform]="transform()" [class.moving]="dragging()">
                @for (src of d.frames; track $index) {
                  <img
                    [src]="src + attemptQuery()"
                    [alt]="$index === 0 ? (d.artwork ? copy.altArt(name()) : copy.alt(name())) : ''"
                    [attr.aria-hidden]="$index === 0 ? null : 'true'"
                    [class.shown]="frame() === $index"
                    draggable="false"
                    decoding="async"
                    (error)="failed.set(true)"
                  />
                }
              </div>
            </div>
          }

          <footer class="controls">
            <p class="credit">{{ d.credit }}</p>
            <div class="buttons">
              @if (!failed() && d.frames.length > 1) {
                <button type="button" class="pill" data-testid="demo-play" (click)="togglePlay()">
                  <ion-icon [name]="playing() ? 'pause' : 'play'" aria-hidden="true" />{{ playing() ? copy.pause : copy.play }}
                </button>
              }
              @if (!failed()) {
                <span class="zoom" role="group" [attr.aria-label]="copy.zoomLevel(percent())">
                  <button type="button" class="icon" data-testid="zoom-out" [attr.aria-label]="copy.zoomOut" [disabled]="zoom().scale <= minScale" (click)="step(1 / stepFactor)">
                    <ion-icon name="remove" aria-hidden="true" />
                  </button>
                  <button type="button" class="reset" data-testid="zoom-reset" [attr.aria-label]="copy.resetZoom" [disabled]="zoom().scale === minScale" (click)="reset()">
                    <span aria-hidden="true">{{ percent() }}%</span>
                  </button>
                  <button type="button" class="icon" data-testid="zoom-in" [attr.aria-label]="copy.zoomIn" (click)="step(stepFactor)">
                    <ion-icon name="add" aria-hidden="true" />
                  </button>
                </span>
              }
            </div>
          </footer>
        </div>
      </ng-template>
    </ion-modal>
  `,
  styleUrl: './demo-viewer.component.scss',
  imports: [IonModal, IonIcon, FitnessButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoViewerComponent {
  readonly open = model(false);
  readonly demo = input.required<ExerciseDemonstration>();
  readonly name = input.required<string>();

  protected readonly copy = WORKOUT_COPY.demo;
  protected readonly minScale = ZOOM_MIN;
  protected readonly stepFactor = ZOOM_STEP;
  protected readonly zoom = signal<ZoomState>(ZOOM_RESET);
  protected readonly dragging = signal(false);
  protected readonly failed = signal(false);
  protected readonly playing = signal(false);
  protected readonly frame = signal(0);
  protected readonly percent = computed(() => Math.round(this.zoom().scale * 100));
  protected readonly transform = computed(() => {
    const { scale, x, y } = this.zoom();
    return `translate(${x}px, ${y}px) scale(${scale})`;
  });
  /** Changes the image URLs on retry so the browser asks again. */
  private readonly attempt = signal(0);
  protected readonly attemptQuery = computed(() => (this.attempt() === 0 ? '' : `?retry=${this.attempt()}`));

  private readonly pad = viewChild<ElementRef<HTMLElement>>('pad');
  private readonly pointers = new Map<number, Point>();
  private pinchStart: { distance: number; zoom: ZoomState } | null = null;
  private lastTap = { at: 0, x: 0, y: 0 };

  constructor() {
    // Each opening starts fitted, with the photos playing (unless the user prefers less motion).
    effect(() => {
      if (this.open()) {
        this.zoom.set(ZOOM_RESET);
        this.failed.set(false);
        this.frame.set(0);
        this.playing.set(!prefersReducedMotion());
      }
    });
    effect((onCleanup) => {
      if (!this.open() || !this.playing() || this.failed() || this.demo().frames.length < 2) {
        return;
      }
      const timer = setInterval(() => this.frame.update((f) => 1 - f), FRAME_MS);
      onCleanup(() => clearInterval(timer));
    });
  }

  // --- Zoom controls ---------------------------------------------------------------------

  protected step(factor: number): void {
    this.zoom.update((z) => zoomAt(z, z.scale * factor, 0, 0, this.size()));
  }

  protected reset(): void {
    this.zoom.set(ZOOM_RESET);
  }

  protected togglePlay(): void {
    this.playing.update((p) => !p);
  }

  protected retry(): void {
    this.failed.set(false);
    this.attempt.update((a) => a + 1);
  }

  // --- Gestures --------------------------------------------------------------------------

  protected pointerDown(event: PointerEvent): void {
    try {
      // Keeps the drag going when a finger slips off the picture; not every pointer can be captured.
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    } catch {
      // The gesture still works without capture.
    }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = { distance: distance(a, b), zoom: this.zoom() };
    }
    this.dragging.set(true);
  }

  protected pointerMove(event: PointerEvent): void {
    const before = this.pointers.get(event.pointerId);
    if (!before) {
      return;
    }
    const now = { x: event.clientX, y: event.clientY };
    this.pointers.set(event.pointerId, now);
    if (this.pointers.size >= 2 && this.pinchStart && this.pinchStart.distance > 0) {
      const [a, b] = [...this.pointers.values()];
      const centre = this.relative({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const start = this.pinchStart;
      this.zoom.set(zoomAt(start.zoom, start.zoom.scale * (distance(a, b) / start.distance), centre.x, centre.y, this.size()));
    } else if (this.pointers.size === 1) {
      this.zoom.update((z) => panBy(z, now.x - before.x, now.y - before.y, this.size()));
    }
  }

  protected pointerUp(event: PointerEvent): void {
    const wasSingle = this.pointers.size === 1;
    this.pointerEnd(event);
    if (!wasSingle) {
      return;
    }
    // Two quick taps in the same place: zoom in there, or back out.
    const at = event.timeStamp;
    const near = Math.hypot(event.clientX - this.lastTap.x, event.clientY - this.lastTap.y) < 30;
    if (at - this.lastTap.at < DOUBLE_TAP_MS && near) {
      const point = this.relative({ x: event.clientX, y: event.clientY });
      this.zoom.update((z) => toggleZoom(z, point.x, point.y, this.size()));
      this.lastTap = { at: 0, x: 0, y: 0 };
    } else {
      this.lastTap = { at, x: event.clientX, y: event.clientY };
    }
  }

  protected pointerEnd(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) {
      this.pinchStart = null;
    }
    if (this.pointers.size === 0) {
      this.dragging.set(false);
    }
  }

  protected wheel(event: WheelEvent): void {
    event.preventDefault();
    const point = this.relative({ x: event.clientX, y: event.clientY });
    const factor = Math.exp(-event.deltaY * 0.0015);
    this.zoom.update((z) => zoomAt(z, z.scale * factor, point.x, point.y, this.size()));
  }

  protected key(event: KeyboardEvent): void {
    const pan = (dx: number, dy: number) => {
      event.preventDefault();
      this.zoom.update((z) => panBy(z, dx, dy, this.size()));
    };
    switch (event.key) {
      case '+':
      case '=':
        event.preventDefault();
        this.step(ZOOM_STEP);
        break;
      case '-':
        event.preventDefault();
        this.step(1 / ZOOM_STEP);
        break;
      case '0':
        event.preventDefault();
        this.reset();
        break;
      case 'ArrowLeft':
        pan(KEY_PAN, 0);
        break;
      case 'ArrowRight':
        pan(-KEY_PAN, 0);
        break;
      case 'ArrowUp':
        pan(0, KEY_PAN);
        break;
      case 'ArrowDown':
        pan(0, -KEY_PAN);
        break;
    }
  }

  private size(): ZoomSize {
    const rect = this.pad()?.nativeElement.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  }

  /** A viewport point as an offset from the viewer's centre. */
  private relative(point: Point): Point {
    const rect = this.pad()?.nativeElement.getBoundingClientRect();
    return rect ? { x: point.x - (rect.left + rect.width / 2), y: point.y - (rect.top + rect.height / 2) } : { x: 0, y: 0 };
  }
}
