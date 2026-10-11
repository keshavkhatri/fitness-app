import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

import { injectExerciseDemonstration } from '../../../core/exercise-media/exercise-media';
import { FitnessButtonComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';

const FRAME_MS = 1000;
const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * "Show demonstration" for one exercise: its start and end position photos,
 * played in turn like a GIF. Collapsed until asked for (nothing is loaded
 * before), with a pause control; starts paused when the user prefers
 * reduced motion. Renders nothing for exercises without a demonstration.
 */
@Component({
  selector: 'app-exercise-demo',
  template: `
    @if (demo(); as d) {
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
  imports: [FitnessButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExerciseDemoComponent {
  readonly exerciseId = input.required<string>();
  readonly name = input.required<string>();

  private readonly demonstrationFor = injectExerciseDemonstration();
  protected readonly copy = WORKOUT_COPY.demo;
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
