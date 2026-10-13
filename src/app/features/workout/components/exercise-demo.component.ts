import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { injectExerciseDemonstration } from '../../../core/exercise-media/exercise-media';
import { FitnessButtonComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';

const FRAME_MS = 1000;
const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Two layouts. `inline` (default): a "Show demonstration" button that opens
 * the photos below it. `stage`: a fixed demonstration area that is always
 * there (so the screen doesn't jump between exercises): a placeholder with a
 * "How to do it" button, replaced by the photos when asked for. Nothing is
 * downloaded in either layout until the user asks.
 *
 * "Show demonstration" for one exercise: its start and end position photos,
 * played in turn like a GIF. Collapsed until asked for (nothing is loaded
 * before), with a pause control; starts paused when the user prefers
 * reduced motion. Renders nothing for exercises without a demonstration.
 */
@Component({
  selector: 'app-exercise-demo',
  template: `
    @if (variant() === 'stage') {
      @let d = demo();
      <div class="wrap">
      <div class="stage" data-testid="demo-stage">
        @if (open() && d) {
          @if (failed()) {
            <div class="failed stage-failed" data-testid="demo-failed">
              <p>{{ copy.failed }}</p>
              <button fit-button type="button" variant="outline" (click)="retry()">{{ copy.retry }}</button>
            </div>
          } @else {
            <div class="frames stage-frames" data-testid="demo">
              @for (src of d.frames; track $index) {
                <img
                  [src]="src + attemptQuery()"
                  [alt]="$index === 0 ? copy.alt(name()) : ''"
                  [attr.aria-hidden]="$index === 0 ? null : 'true'"
                  [class.shown]="frame() === $index"
                  decoding="async"
                  (error)="failed.set(true)"
                />
              }
            </div>
          }
        } @else {
          <div class="placeholder" aria-hidden="true"><ion-icon name="barbell" /></div>
        }
      </div>
      @if (d) {
        <!-- One persistent toggle (focus stays on it): over the placeholder when closed, under the photos when open. -->
        <div class="stage-bar" [class.overlay]="!open()">
          <button type="button" class="pill" [attr.aria-expanded]="open()" data-testid="demo-toggle" (click)="toggle()">
            <ion-icon [name]="open() ? 'close' : 'play'" aria-hidden="true" />{{ open() ? copy.hide : howTo }}
          </button>
          @if (open() && !failed()) {
            <button type="button" class="pill" data-testid="demo-play" (click)="togglePlay()">
              <ion-icon [name]="playing() ? 'pause' : 'play'" aria-hidden="true" />{{ playing() ? copy.pause : copy.play }}
            </button>
            <span class="credit">{{ d.credit }}</span>
          }
        </div>
      }
      </div>
    } @else if (demo(); as d) {
      <button
        fit-button
        type="button"
        variant="ghost"
        [icon]="open() ? 'close' : 'play-outline'"
        [attr.aria-expanded]="open()"
        data-testid="demo-toggle"
        (click)="toggle()"
      >
        {{ open() ? copy.hide : copy.show }}
      </button>
      @if (open()) {
        <figure class="demo" data-testid="demo">
          @if (failed()) {
            <div class="failed" data-testid="demo-failed">
              <p>{{ copy.failed }}</p>
              <button fit-button type="button" variant="outline" (click)="retry()">{{ copy.retry }}</button>
            </div>
          } @else {
            <div class="frames">
              @for (src of d.frames; track $index) {
                <img
                  [src]="src + attemptQuery()"
                  [alt]="$index === 0 ? copy.alt(name()) : ''"
                  [attr.aria-hidden]="$index === 0 ? null : 'true'"
                  [class.shown]="frame() === $index"
                  decoding="async"
                  (error)="failed.set(true)"
                />
              }
            </div>
          }
          <figcaption class="caption">
            @if (!failed()) {
              <button fit-button type="button" variant="ghost" [icon]="playing() ? 'pause-outline' : 'play-outline'" data-testid="demo-play" (click)="togglePlay()">
                {{ playing() ? copy.pause : copy.play }}
              </button>
            }
            <span class="credit">{{ d.credit }}</span>
          </figcaption>
        </figure>
      }
    }
  `,
  styles: `
    @use 'mixins' as fx;

    .stage {
      position: relative;
      aspect-ratio: 16 / 9;
      max-height: min(220px, 22vh);
      overflow: hidden;
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }

    .placeholder {
      display: grid;
      place-items: center;
      box-sizing: border-box;
      height: 100%;
      padding-bottom: calc(var(--tap-target-min) + var(--space-3));
      background: linear-gradient(160deg, var(--color-surface-elevated), var(--color-surface-muted));
      color: var(--color-primary-text);
      font-size: 56px;
      opacity: 0.85;
    }

    // More specific than the .frames rule below: fill the stage instead of keeping 4:3.
    .frames.stage-frames {
      width: 100%;
      height: 100%;
      aspect-ratio: auto;
      border-radius: 0;
    }

    .stage-failed {
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: var(--space-3);
      text-align: center;
    }

    .wrap {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .stage-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }

    .stage-bar.overlay {
      position: absolute;
      inset-inline-start: var(--space-3);
      bottom: var(--space-3);
    }

    .stage-bar .credit {
      flex: 1 1 100%;
    }

    .pill {
      @include fx.button-reset;
      @include fx.focus-ring;
      @include fx.text(body-sm, semibold);

      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      min-height: var(--tap-target-min);
      padding: 0 var(--space-4);
      border-radius: var(--radius-pill);
      background: var(--color-surface-elevated);
      border: var(--border-hairline) solid var(--color-border-strong);
      color: var(--color-text);

      ion-icon {
        font-size: 16px;
      }
    }

    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .demo {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
    }

    .frames {
      position: relative;
      aspect-ratio: 4 / 3;
      overflow: hidden;
      border-radius: var(--radius-md);
      background: #fff;

      img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
        opacity: 0;
        transition: opacity 200ms ease;

        &.shown {
          opacity: 1;
        }
      }
    }

    .failed {
      @include fx.text(body-sm);
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
      color: var(--color-text-secondary);
    }

    .caption {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .credit {
      @include fx.text(caption);
      color: var(--color-text-secondary);
    }

    @media (prefers-reduced-motion: reduce) {
      .frames img {
        transition: none;
      }
    }
  `,
  imports: [IonIcon, FitnessButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExerciseDemoComponent {
  readonly exerciseId = input.required<string>();
  readonly name = input.required<string>();
  readonly variant = input<'inline' | 'stage'>('inline');

  private readonly demonstrationFor = injectExerciseDemonstration();
  protected readonly copy = WORKOUT_COPY.demo;
  protected readonly howTo = WORKOUT_COPY.active.howTo;
  protected readonly demo = computed(() => this.demonstrationFor(this.exerciseId()));
  protected readonly open = signal(false);
  protected readonly playing = signal(false);
  protected readonly frame = signal(0);
  protected readonly failed = signal(false);
  /** Changes the image URLs on retry so the browser asks again. */
  private readonly attempt = signal(0);
  protected readonly attemptQuery = computed(() => (this.attempt() === 0 ? '' : `?retry=${this.attempt()}`));

  constructor() {
    effect((onCleanup) => {
      if (!this.open() || !this.playing() || this.failed()) {
        return;
      }
      const timer = setInterval(() => this.frame.update((f) => 1 - f), FRAME_MS);
      onCleanup(() => clearInterval(timer));
    });
    // A new exercise (the active workout moves on): start collapsed again.
    effect(() => {
      this.exerciseId();
      this.open.set(false);
      this.failed.set(false);
      this.frame.set(0);
    });
  }

  protected toggle(): void {
    const open = !this.open();
    this.open.set(open);
    this.playing.set(open && !prefersReducedMotion());
  }

  protected togglePlay(): void {
    this.playing.update((p) => !p);
  }

  protected retry(): void {
    this.failed.set(false);
    this.attempt.update((a) => a + 1);
  }
}
