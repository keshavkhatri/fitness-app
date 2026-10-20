import { ChangeDetectionStrategy, Component, inject, model, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { PrivateTestingService, PromoResult } from '../../../core/entitlements/private-testing/private-testing.service';
import { PRIVATE_TESTING_CONFIG } from '../../../core/entitlements/private-testing/private-testing.config';
import { BottomSheetComponent, FitnessButtonComponent, TextFieldComponent } from '../../../shared/ui';
import { environment } from '../../../../environments/environment';

/** Feedback for a code that didn't work (the success state has its own screen). */
const PROBLEMS: Partial<Record<PromoResult, string>> = {
  invalid: "That code isn't valid. Check the spelling and try again.",
  empty: 'Enter a promo code.',
  unavailable: "Promo codes aren't available in this version of the app.",
};

/**
 * Enter a private-testing promo code, then a clear success state. Redemption is PrivateTestingService's
 * (the code, its comparison and the switch live there, not here). Success is always called test access:
 * it is never shown as a purchase or a subscription.
 */
@Component({
  selector: 'app-promo-code-sheet',
  template: `
    <fit-bottom-sheet screenTheme="dashboard" [title]="active() ? 'Pro test access' : 'Enter Promo Code'" [(open)]="open">
      @if (active()) {
        <div class="done" data-testid="promo-success">
          <span class="badge" aria-hidden="true"><ion-icon name="checkmark-circle" /></span>
          <h3 class="headline">Pro test access is active</h3>
          <p class="text">You can use Pro features on this device. This is test access for private testing, <strong>not a subscription</strong>, and nothing was charged.</p>
          <button fit-button type="button" block data-testid="promo-done" (click)="open.set(false)">Done</button>
          <button fit-button type="button" variant="ghost" block data-testid="promo-turn-off" (click)="turnOff()">Turn off test access</button>
        </div>
      } @else {
        <div class="form" data-testid="promo-form">
          <span class="badge gift" aria-hidden="true"><ion-icon name="gift-outline" /></span>
          <h3 class="headline">Have a promo code?</h3>
          <p class="text">Enter the code below to get Pro access for free (private testing). It is not a subscription, and nothing is charged.</p>
          <fit-text-field
            label="Promo code"
            autocomplete="off"
            enterKeyHint="done"
            [maxLength]="40"
            [value]="code()"
            (valueChange)="code.set($event); problem.set(null)"
            [error]="problem()"
            data-testid="offer-promo-input"
          />
          <button fit-button type="button" block [loading]="busy()" [disabled]="busy()" data-testid="offer-promo-apply" (click)="apply()">Apply</button>
          @if (demoCode; as demo) {
            <div class="demo" data-testid="promo-demo">
              <ion-icon name="information-circle-outline" aria-hidden="true" />
              <span class="demo-text"><span class="demo-label">Demo code (development builds only)</span><span class="demo-code">{{ demo }}</span></span>
              <button type="button" class="copy" aria-label="Use the demo code" (click)="code.set(demo); problem.set(null)">
                <ion-icon name="copy-outline" aria-hidden="true" />
              </button>
            </div>
          }
        </div>
      }
    </fit-bottom-sheet>
  `,
  styleUrl: './promo-code-sheet.component.scss',
  imports: [IonIcon, BottomSheetComponent, FitnessButtonComponent, TextFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromoCodeSheetComponent {
  private readonly testing = inject(PrivateTestingService);
  /** Shown to fill in only in development builds; the store build never displays the code. */
  protected readonly demoCode = environment.production ? null : inject(PRIVATE_TESTING_CONFIG).promoCode;

  readonly open = model(false);
  protected readonly active = this.testing.active;
  protected readonly code = signal('');
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected async apply(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      const result = await this.testing.redeem(this.code());
      this.problem.set(PROBLEMS[result] ?? null);
      if (result === 'activated') {
        this.code.set('');
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async turnOff(): Promise<void> {
    await this.testing.deactivate();
  }
}
