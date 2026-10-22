import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent } from '../../../shared/ui';
import { HydrationView } from '../nutrition-water';

/**
 * Water today against the daily goal: four glasses, each a quarter of it, filling as the user drinks. "+" adds a
 * glass (250 ml); the card opens the sheet to correct the amount. Motion (docs/motion-plan.md #13): the water rises,
 * its surface ripples, and the glass that just got water splashes.
 */
@Component({
  selector: 'app-hydration-card',
  template: `
    @let h = hydration();
    <fit-card>
      <div class="head">
        <h2 class="title">
          <button type="button" class="title-link" data-testid="water-open" [attr.aria-label]="'Hydration. ' + h.accessibleLabel + ' Change amount'" (click)="open.emit()">
            <ion-icon class="drop" name="water" aria-hidden="true" />Hydration
          </button>
        </h2>
        <span class="chevron" aria-hidden="true"><ion-icon name="chevron-forward" /></span>
      </div>
      <p class="amount" aria-hidden="true">
        <span class="value" data-testid="water-amount">{{ h.amount }}</span>&ngsp;<span class="goal">{{ h.goal }}</span>
      </p>
      <div class="foot">
        <span class="glasses" aria-hidden="true">
          @for (fill of h.glasses; track $index) {
            <svg class="glass" viewBox="0 0 20 28" [class.splash]="splash() === $index">
              <defs>
                <clipPath [attr.id]="clipId + $index"><path d="M2 2 H18 L16 26 H4 Z" /></clipPath>
              </defs>
              <g [attr.clip-path]="'url(#' + clipId + $index + ')'">
                <!-- The water rises to its level; its surface (a wave twice the glass wide) drifts sideways. -->
                <g class="level" [style.transform]="'translateY(' + (1 - fill) * 26 + 'px)'">
                  <path class="water" d="M0 2 Q5 0 10 2 T20 2 T30 2 T40 2 V30 H0 Z" />
                </g>
              </g>
              <path class="outline" d="M2 2 H18 L16 26 H4 Z" />
            </svg>
          }
        </span>
        <button type="button" class="add" data-testid="water-add" aria-label="Add a glass of water, 250 millilitres" [class.bounce]="splash() !== null" [disabled]="busy()" (click)="addGlass.emit()">
          <ion-icon name="add" aria-hidden="true" />
        </button>
      </div>
    </fit-card>
  `,
  styleUrl: './hydration-card.component.scss',
  imports: [IonIcon, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HydrationCardComponent {
  readonly hydration = input.required<HydrationView>();
  /** A save is in progress. */
  readonly busy = input(false);
  readonly open = output<void>();
  readonly addGlass = output<void>();

  private static next = 0;
  protected readonly clipId = `home-glass-${HydrationCardComponent.next++}-`;
  /** The glass that just got water (it splashes), for a moment after the amount goes up. */
  protected readonly splash = signal<number | null>(null);

  constructor() {
    let previous: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const glasses = this.hydration().glasses;
      const total = glasses.reduce((a, b) => a + b, 0);
      if (previous !== null && total > previous) {
        const last = glasses.reduce((at, fill, i) => (fill > 0 ? i : at), 0);
        this.splash.set(last);
        clearTimeout(timer);
        timer = setTimeout(() => this.splash.set(null), 650);
      }
      previous = total;
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }
}
