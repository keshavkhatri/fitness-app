import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { EntitlementService, RestoreResult } from '../../../core/entitlements/entitlement.service';
import { BottomSheetComponent, FitnessButtonComponent } from '../../../shared/ui';

type Step = 'idle' | 'working' | RestoreResult;

const RESULTS: Record<RestoreResult, { readonly title: string; readonly text: string; readonly icon: string }> = {
  restored: { title: 'Pro is active', text: 'Your subscription was found and confirmed by the store.', icon: 'checkmark-circle' },
  none: {
    title: 'No subscription found',
    text: "The store has no active Pro subscription for the account on this phone. If you subscribed with another Google account, sign in to Google Play with it and try again.",
    icon: 'information-circle-outline',
  },
  failed: { title: "Couldn't reach the store", text: 'Check your connection and try again. Nothing has changed.', icon: 'alert-circle-outline' },
  unavailable: {
    title: 'Nothing to restore here',
    text: "Subscriptions aren't set up in this version of the app, so there are no purchases to restore.",
    icon: 'information-circle-outline',
  },
};

/**
 * Restore purchases: asks the billing provider to restore, then reads the entitlement again
 * (EntitlementService.restorePurchases). Shows what was actually found; it never creates a subscription.
 */
@Component({
  selector: 'app-restore-sheet',
  template: `
    <fit-bottom-sheet
      screenTheme="dashboard"
      title="Restore Purchases"
      [(open)]="open"
    >
      <div class="body" data-testid="restore-sheet">
        <div class="intro">
          <span class="ring" aria-hidden="true"><ion-icon name="sync-outline" /></span>
          <h3 class="intro-title">Restore Purchases</h3>
          <p class="intro-text">Restore your Pro subscription if you've purchased it on another device or reinstalled the app.</p>
        </div>
        @let result = outcome();
        @if (result) {
          <div class="result" [class.ok]="step() === 'restored'" role="status" [attr.data-testid]="'restore-' + step()">
            <ion-icon [name]="result.icon" aria-hidden="true" />
            <div>
              <p class="result-title">{{ result.title }}</p>
              <p class="result-text">{{ result.text }}</p>
            </div>
          </div>
        }
        @if (step() === 'restored' || step() === 'unavailable') {
          <button fit-button type="button" block data-testid="restore-done" (click)="open.set(false)">Done</button>
        } @else {
          <button fit-button type="button" block [loading]="step() === 'working'" [disabled]="step() === 'working'" data-testid="restore-run" (click)="restore()">
            {{ step() === 'failed' || step() === 'none' ? 'Try again' : 'Restore' }}
          </button>
        }
        <p class="footnote">This will update your subscription status from the app store.</p>
      </div>
    </fit-bottom-sheet>
  `,
  styleUrl: './restore-sheet.component.scss',
  imports: [IonIcon, BottomSheetComponent, FitnessButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestoreSheetComponent {
  private readonly entitlements = inject(EntitlementService);

  readonly open = model(false);
  protected readonly step = signal<Step>(this.entitlements.billingConfigured ? 'idle' : 'unavailable');
  protected readonly outcome = computed(() => {
    const step = this.step();
    return step === 'idle' || step === 'working' ? null : RESULTS[step];
  });

  protected async restore(): Promise<void> {
    if (this.step() === 'working') {
      return;
    }
    this.step.set('working');
    this.step.set(await this.entitlements.restorePurchases());
  }
}
