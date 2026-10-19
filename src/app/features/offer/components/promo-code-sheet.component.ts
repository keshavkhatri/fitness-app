import { ChangeDetectionStrategy, Component, inject, model, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { PrivateTestingService, PromoResult } from '../../../core/entitlements/private-testing/private-testing.service';
import { BottomSheetComponent, FitnessButtonComponent, TextFieldComponent } from '../../../shared/ui';

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
    <fit-bottom-sheet screenTheme="dashboard" [title]="active() ? 'Pro test access' : 'Have a promo code?'" [(open)]="open">
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
          <span class="badge soft" aria-hidden="true"><ion-icon name="ticket-outline" /></span>
          <p class="text">A promo code unlocks Pro on this device for private testing. It is not a subscription, and nothing is charged.</p>
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
          <button fit-button type="button" block [loading]="busy()" [disabled]="busy()" data-testid="offer-promo-apply" (click)="apply()">Apply code</button>
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
