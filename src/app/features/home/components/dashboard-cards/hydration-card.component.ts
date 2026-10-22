import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent } from '../../../../shared/ui';
import { HydrationView } from '../../home-dashboard';

/**
 * Water today against the daily goal: four glasses, each a quarter of it, filling as the user drinks. "+" adds a
 * glass (250 ml); the card opens the sheet to correct the amount.
 */
@Component({
  selector: 'app-hydration-card',
  template: `
    @let h = hydration();
    <fit-card>
      <div class="head">
        <h2 class="title">
          <button type="button" class="title-link" data-testid="home-water-open" [attr.aria-label]="'Hydration. ' + h.accessibleLabel + ' Change amount'" (click)="open.emit()">
            <ion-icon class="drop" name="water" aria-hidden="true" />Hydration
          </button>
        </h2>
        <span class="chevron" aria-hidden="true"><ion-icon name="chevron-forward" /></span>
      </div>
      <p class="amount" aria-hidden="true">
        <span class="value" data-testid="home-water-amount">{{ h.amount }}</span>&ngsp;<span class="goal">{{ h.goal }}</span>
      </p>
      <div class="foot">
        <span class="glasses" aria-hidden="true">
          @for (fill of h.glasses; track $index) {
            <svg class="glass" viewBox="0 0 20 28">
              <defs>
                <clipPath [attr.id]="clipId + $index"><path d="M2 2 H18 L16 26 H4 Z" /></clipPath>
              </defs>
              <rect class="water" x="0" [attr.y]="28 - fill * 26" width="20" height="28" [attr.clip-path]="'url(#' + clipId + $index + ')'" />
              <path class="outline" d="M2 2 H18 L16 26 H4 Z" />
            </svg>
          }
        </span>
        <button type="button" class="add" data-testid="home-water-add" aria-label="Add a glass of water, 250 millilitres" [disabled]="busy()" (click)="addGlass.emit()">
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
}
