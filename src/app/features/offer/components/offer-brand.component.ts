import { ChangeDetectionStrategy, Component } from '@angular/core';

/** The plan screens' logo and wordmark (on ink). */
@Component({
  selector: 'app-offer-brand',
  template: `
    <img src="assets/icon/favicon.png" width="32" height="32" alt="" />
    <span class="wordmark">Stoke<span class="accent">Form</span></span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
    }

    img {
      border-radius: 8px;
    }

    .wordmark {
      font-size: 20px;
      font-weight: 700;
      font-style: italic;
      color: var(--color-on-ink);
    }

    .accent {
      color: var(--color-ink-accent);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferBrandComponent {}
