import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { EntitlementService } from '../../core/entitlements/entitlement.service';
import { PrivateTestingService } from '../../core/entitlements/private-testing/private-testing.service';
import { FitnessButtonComponent, FitnessChipComponent } from '../../shared/ui';

/**
 * "Your plan" on You: Free, Pro (a subscription confirmed by the store) or Pro test access (a private-testing
 * code, never shown as a subscription), plus loading and "couldn't check" states. Opens the plan screen;
 * test access can be turned off here, which never touches the real subscription.
 */
@Component({
  selector: 'app-plan-status',
  template: `
    <button type="button" class="plan-row" (click)="openPlans.emit()" data-testid="plan-entry">
      <span class="plan-text">
        <span class="plan-line">
          <span class="plan-name" data-testid="plan-name">{{ name() }}</span>
          @if (badge(); as label) {
            <fit-chip [icon]="label === 'Test access' ? 'ticket-outline' : 'checkmark-circle'" data-testid="plan-badge">{{ label }}</fit-chip>
          }
        </span>
        <span class="hint" data-testid="plan-hint">{{ hint() }}</span>
      </span>
      <ion-icon name="chevron-forward" aria-hidden="true" />
    </button>
    @if (source() === 'test') {
      <button fit-button type="button" variant="outline" data-testid="plan-test-off" (click)="turnOffTestAccess()">Turn off test access</button>
    }
  `,
  styleUrl: './plan-status.component.scss',
  imports: [IonIcon, FitnessButtonComponent, FitnessChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanStatusComponent {
  private readonly entitlements = inject(EntitlementService);
  private readonly testing = inject(PrivateTestingService);

  readonly openPlans = output<void>();

  protected readonly source = this.entitlements.source;
  protected readonly name = computed(() => (this.source() === 'none' ? 'Free' : 'Pro'));
  protected readonly badge = computed(() => (this.source() === 'test' ? 'Test access' : this.source() === 'subscription' ? 'Subscription' : null));
  protected readonly hint = computed(() => {
    switch (this.source()) {
      case 'subscription':
        return 'Confirmed by the store';
      case 'test':
        return 'Test access, not a subscription';
    }
    const entitlement = this.entitlements.entitlement();
    if (entitlement.status === 'loading') {
      return 'Checking your plan…';
    }
    if (entitlement.status === 'free' && entitlement.reason === 'unverified') {
      return "Couldn't check your subscription. Tap to try again.";
    }
    if (entitlement.status === 'free' && entitlement.reason === 'expired') {
      return 'Your Pro subscription has ended';
    }
    return this.entitlements.billingConfigured ? 'See what Pro adds' : "Pro isn't available to buy yet";
  });

  constructor() {
    void this.entitlements.refresh();
  }

  protected async turnOffTestAccess(): Promise<void> {
    await this.testing.deactivate();
  }
}
