import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { injectExerciseDemonstration } from '../../../core/exercise-media/exercise-media';
import { FitnessButtonComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { DemoViewerComponent } from './demo-viewer.component';

/**
 * The way into "how to do it" for one exercise. Two layouts: `inline`
 * (default) is a "Show demonstration" button; `stage` is a fixed area that is
 * always there (so the screen doesn't jump between exercises): the page's
 * stand-in imagery with a "How to do it" button over it. Either opens the
 * demonstration in a full-screen, zoomable popup (DemoViewerComponent);
 * nothing is downloaded until then. Renders no button for exercises without
 * a demonstration.
 */
@Component({
  selector: 'app-exercise-demo',
  template: `
    @let d = demo();
    @if (variant() === 'stage') {
      <div class="stage" data-testid="demo-stage">
        <!-- The page's stand-in imagery (decorative). -->
        <div class="placeholder" aria-hidden="true"><ng-content /></div>
        @if (d) {
          <div class="stage-bar">
            <button type="button" class="pill" aria-haspopup="dialog" data-testid="demo-toggle" (click)="open.set(true)">
              <span class="pill-face"><ion-icon name="play" aria-hidden="true" />{{ howTo }}</span>
            </button>
          </div>
        }
      </div>
    } @else if (d) {
      <button fit-button type="button" variant="ghost" icon="play-outline" aria-haspopup="dialog" data-testid="demo-toggle" (click)="open.set(true)">
        {{ copy.show }}
      </button>
    }
    @if (d) {
      <app-demo-viewer [(open)]="open" [demo]="d" [name]="name()" />
    }
  `,
  styles: `
    @use 'mixins' as fx;

    // Stage: fills the host (the page sizes it); the button floats over its lower left.
    .stage {
      position: relative;
      height: 100%;
      overflow: hidden;
    }

    .placeholder {
      height: 100%;
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
      background: rgba(20, 22, 20, 0.74);
      color: #ffffff;
      font-size: 13px;

      ion-icon {
        font-size: 13px;
      }
    }
  `,
  imports: [IonIcon, FitnessButtonComponent, DemoViewerComponent],
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

  constructor() {
    // A new exercise (the active workout moves on): the popup closes.
    effect(() => {
      this.exerciseId();
      this.open.set(false);
    });
  }
}
