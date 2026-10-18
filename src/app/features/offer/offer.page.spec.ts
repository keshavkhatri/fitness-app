import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { ActiveSubscription, BILLING_PROVIDER, BillingProvider, NO_BILLING } from '../../core/entitlements/billing';
import { EntitlementService } from '../../core/entitlements/entitlement.service';
import { FirstRunOfferService } from '../../core/entitlements/first-run-offer.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { OfferPage } from './offer.page';

async function render({ billing = NO_BILLING, next }: { billing?: BillingProvider; next?: string } = {}) {
  const storage = new MemoryKeyValueStorage();
  storage.values.set('stokeform.first-run-offer', JSON.stringify({ version: 1 }));
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      { provide: KeyValueStorage, useValue: storage },
      { provide: BILLING_PROVIDER, useValue: billing },
    ],
  });
  const root = vi.spyOn(TestBed.inject(NavController), 'navigateRoot').mockResolvedValue(true);
  const fixture = TestBed.createComponent(OfferPage);
  if (next !== undefined) {
    fixture.componentRef.setInput('next', next);
  }
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
    }
  };
  fixture.detectChanges();
  await settle();
  const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return { fixture, el, q, settle, root, storage };
}

describe('OfferPage (Free or Premium)', () => {
  it('with no billing provider: no price, no trial, no buy button; Premium says plainly it is not available', async () => {
    const { el, q } = await render();
    expect(q('offer-free')!.textContent).toContain('Personal workout plan');
    expect((q('offer-premium-unavailable') as HTMLButtonElement).disabled).toBe(true);
    expect(el.textContent).toContain('nothing will be charged');
    expect(el.querySelector('[data-testid^="offer-buy-"]')).toBeNull();
    expect(q('offer-trial-terms')).toBeNull();
    expect(q('offer-restore')).toBeNull();
    expect(el.textContent).not.toMatch(/[£$€]\s?\d/);
    expect(TestBed.inject(EntitlementService).plan()).toBe('free');
  });

  it('"Continue with Free" records the choice, ends the first-run offer and goes where the user was headed', async () => {
    const { q, settle, root, storage } = await render({ next: '/you' });
    expect(q('offer-continue-free')!.textContent!.trim()).toBe('Continue with Free');
    q('offer-continue-free')!.click();
    await settle();
    expect(root).toHaveBeenCalledWith('/you');
    expect(await TestBed.inject(FirstRunOfferService).isPending()).toBe(false);
    expect(JSON.parse(storage.values.get('stokeform.plan-choice')!)).toMatchObject({ choice: 'free', accountId: null });
  });

  it('an outside link in `next` goes Home instead', async () => {
    const { q, settle, root } = await render({ next: 'https://example.test/phish' });
    q('offer-continue-free')!.click();
    await settle();
    expect(root).toHaveBeenCalledWith('/home');
  });

  it("with a provider: shows the store's own price and trial terms; a tap that isn't confirmed keeps Free", async () => {
    let confirmed: ActiveSubscription | null = null;
    const purchase = vi.fn(async () => ({ kind: 'completed' }) as const);
    const billing: BillingProvider = {
      ...NO_BILLING,
      id: 'fake',
      availability: async () => ({
        status: 'available',
        products: [{ id: 'monthly', title: 'Premium', price: '£4.99', period: 'month', trial: { length: '7 days', renewalPrice: '£4.99/month', cancellationTerms: 'Cancel any time before it ends.' } }],
      }),
      purchase,
      activeSubscription: async () => confirmed,
    };
    const { q, settle, root } = await render({ billing });
    expect(q('offer-product-monthly')!.textContent).toContain('£4.99');
    expect(q('offer-trial-terms')!.textContent).toContain('Free for 7 days, then £4.99/month.');

    q('offer-buy-monthly')!.click();
    await settle();
    expect(purchase).toHaveBeenCalledWith('monthly');
    expect(q('offer-purchase-failed')).not.toBeNull();
    expect(TestBed.inject(EntitlementService).plan()).toBe('free');
    expect(root).not.toHaveBeenCalled();

    confirmed = { productId: 'monthly', active: true, expiresAt: null };
    q('offer-buy-monthly')!.click();
    await settle();
    expect(TestBed.inject(EntitlementService).plan()).toBe('premium');
    expect(root).toHaveBeenCalledWith('/home');
  });
});
