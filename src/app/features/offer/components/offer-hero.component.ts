import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

/** The plan screen's brand header (ink): logo, wordmark, headline, and the current Pro status when there is one. */
@Component({
  selector: 'app-offer-hero',
  template: `
    <div class="brand">
      <img src="assets/icon/favicon.png" width="36" height="36" alt="" />
      <span class="wordmark">Stoke<span class="accent">Form</span></span>
    </div>
    <h1 class="title" data-testid="offer-title">Unlock your full potential</h1>
    <p class="lead">Build and edit your own workout plan with Pro. Everything else in StokeForm stays free.</p>
    @if (status(); as label) {
      <span class="status-pill" data-testid="offer-hero-status">
        <ion-icon name="checkmark-circle" aria-hidden="true" />
        {{ label }}
      </span>
    }
  `,
  styleUrl: './offer-hero.component.scss',
  host: { role: 'banner' },
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferHeroComponent {
  /** "Pro active" or "Pro test access"; null on Free. */
  readonly status = input<string | null>(null);
}
