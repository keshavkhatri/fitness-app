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
      <div class="stage" data-testid="demo-stage" [class.showing]="open() && !!d" [class.art-stage]="artOpen()">
        @if (open() && d) {
          @if (failed()) {
            <div class="failed stage-failed" data-testid="demo-failed">
              <p>{{ copy.failed }}</p>
              <button fit-button type="button" variant="outline" (click)="retry()">{{ copy.retry }}</button>
            </div>
          } @else {
            <div class="frames stage-frames" [class.art]="d.artwork" data-testid="demo">
              @for (src of d.frames; track $index) {
                <img
                  [src]="src + attemptQuery()"
                  [alt]="$index === 0 ? (d.artwork ? copy.altArt(name()) : copy.alt(name())) : ''"
                  [attr.aria-hidden]="$index === 0 ? null : 'true'"
                  [class.shown]="frame() === $index"
                  decoding="async"
                  (error)="failed.set(true)"
                />
              }
            </div>
            <span class="stage-credit" [class.art]="d.artwork">{{ d.credit }}</span>
          }
        } @else {
          <!-- The page's stand-in imagery (decorative). -->
          <div class="placeholder" aria-hidden="true"><ng-content /></div>
        }
        @if (d) {
          <!-- One persistent toggle, so focus stays on it when the photos open or close. -->
          <div class="stage-bar">
            <button type="button" class="pill" [attr.aria-expanded]="open()" data-testid="demo-toggle" (click)="toggle()">
              <span class="pill-face"><ion-icon [name]="open() ? 'close' : 'play'" aria-hidden="true" />{{ open() ? copy.hide : howTo }}</span>
            </button>
            @if (open() && !failed() && d.frames.length > 1) {
              <button type="button" class="pill" data-testid="demo-play" (click)="togglePlay()">
                <span class="pill-face"><ion-icon [name]="playing() ? 'pause' : 'play'" aria-hidden="true" />{{ playing() ? copy.pause : copy.play }}</span>
              </button>
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
            <div class="frames" [class.art]="d.artwork">
              @for (src of d.frames; track $index) {
                <img
                  [src]="src + attemptQuery()"
                  [alt]="$index === 0 ? (d.artwork ? copy.altArt(name()) : copy.alt(name())) : ''"
                  [attr.aria-hidden]="$index === 0 ? null : 'true'"
                  [class.shown]="frame() === $index"
                  decoding="async"
                  (error)="failed.set(true)"
                />
              }
            </div>
          }
          <figcaption class="caption">
            @if (!failed() && d.frames.length > 1) {
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

    // Stage: fills the host (the page sizes it); controls float over its lower left.
    .stage {
      position: relative;
      height: 100%;
      overflow: hidden;
    }

    .placeholder {
      height: 100%;
    }

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

    .stage-bar {
      position: absolute;
      inset-inline-start: var(--stage-inset, var(--space-5));
      bottom: var(--stage-bottom, var(--space-3));
      display: flex;
      gap: var(--space-2);
    }

    // A full 44px target around a compact pill.
    .pill {
      @include fx.button-reset;
      @include fx.focus-ring;

      display: inline-flex;
      align-items: center;
      min-height: var(--tap-target-min);
      border-radius: var(--radius-pill);
    }

    .pill-face {
      @include fx.text(caption, semibold);

      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      height: 32px;
      padding: 0 var(--space-3);
      border: var(--border-hairline) solid rgba(255, 255, 255, 0.22);
      border-radius: var(--radius-pill);
      background: rgba(20, 22, 20, 0.62);
      color: #ffffff;
      font-size: 13px;
      backdrop-filter: blur(6px);

      ion-icon {
        font-size: 13px;
      }
    }

    // The guide sheet is a 3:2 composition: shown whole (never cropped), on its own background.
    .frames.art {
      aspect-ratio: 3 / 2;
      background: #f5f4ee;

      img {
        transition: none;
      }
    }

    // A guide sheet in the stage: the whole 3:2 sheet, with a band underneath for the controls and credit
    // (so nothing covers the sheet's text).
    .stage.art-stage {
      --stage-bottom: var(--space-2);

      height: auto;
      padding-bottom: 52px;
      background: var(--color-bg);
    }

    .frames.stage-frames.art {
      height: auto;
      aspect-ratio: 3 / 2;
    }

    .stage-credit.art {
      top: auto;
      bottom: 18px;
      inset-inline-end: var(--space-3);
      background: transparent;
      color: var(--color-text-secondary);
    }

    .stage-credit {
      @include fx.text(caption);
      position: absolute;
      top: var(--space-2);
      inset-inline-end: var(--space-2);
      padding: 2px var(--space-2);
      border-radius: var(--radius-sm);
      background: rgba(20, 22, 20, 0.62);
      color: #ffffff;
      font-size: 11px;
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
  // The page sizes the stage; an open guide sheet needs its own (taller) height, see .art-open in the page styles.
  host: { '[class.art-open]': 'artOpen()' },
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
  protected readonly failed = signal(false);
  /** The stage is showing a guide sheet (not collapsed, not failed). */
  protected readonly artOpen = computed(() => this.variant() === 'stage' && this.open() && !this.failed() && !!this.demo()?.artwork);
  protected readonly playing = signal(false);
  protected readonly frame = signal(0);
  /** Changes the image URLs on retry so the browser asks again. */
  private readonly attempt = signal(0);
  protected readonly attemptQuery = computed(() => (this.attempt() === 0 ? '' : `?retry=${this.attempt()}`));

  constructor() {
    effect((onCleanup) => {
      if (!this.open() || !this.playing() || this.failed() || (this.demo()?.frames.length ?? 0) < 2) {
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
