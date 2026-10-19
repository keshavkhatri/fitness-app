import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { ActiveSubscription, BILLING_PROVIDER, BillingProvider, NO_BILLING } from '../../core/entitlements/billing';
import { EntitlementService } from '../../core/entitlements/entitlement.service';
import { BillingAvailability } from '../../core/entitlements/billing';
import { FirstRunOfferService } from '../../core/entitlements/first-run-offer.service';
import { PRIVATE_TESTING_CONFIG, PRIVATE_TESTING_OFF, PrivateTestingConfig } from '../../core/entitlements/private-testing/private-testing.config';
import { PrivateTestingService } from '../../core/entitlements/private-testing/private-testing.service';
import { PREMIUM_TEST_BILLING } from '../../core/entitlements/testing/premium-billing';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { OfferPage } from './offer.page';

const TESTING_ON: PrivateTestingConfig = { enabled: true, promoCode: 'STOKEFORMLAB' };

async function render({ billing = NO_BILLING, next, testing = TESTING_ON }: { billing?: BillingProvider; next?: string; testing?: PrivateTestingConfig } = {}) {
  const storage = new MemoryKeyValueStorage();
  storage.values.set('stokeform.first-run-offer', JSON.stringify({ version: 1 }));
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      { provide: KeyValueStorage, useValue: storage },
      { provide: BILLING_PROVIDER, useValue: billing },
      { provide: PRIVATE_TESTING_CONFIG, useValue: testing },
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

const providerAnswering = (availability: BillingAvailability): BillingProvider => ({ ...NO_BILLING, id: 'fake', availability: async () => availability });
type Query = (id: string) => HTMLElement | null;

describe('OfferPage: the Pro plan', () => {
  it('names the paid plan Pro and promises only what is built: the custom workout plan', async () => {
    const { q, el } = await render();
    expect(q('offer-premium')!.querySelector('h2')!.textContent!.trim()).toBe('Pro');
    expect(q('offer-pro-features')!.textContent).toContain('Build and edit your own workout plan');
    expect(q('offer-pro-features')!.textContent).toContain('Included in Pro');
    expect(q('offer-pro-features')!.textContent).toContain('Not in Free');
    for (const unbuilt of ['Back up and sync', 'Progress photos', 'health apps']) {
      expect(el.textContent).not.toContain(unbuilt);
    }
    expect(el.textContent).not.toContain('Premium');
    // The generated plan and the exercise library are Free.
    expect(q('offer-free')!.textContent).toContain('Personal workout plan');
    expect(q('offer-free')!.textContent).toContain('Exercise library');
    expect(q('offer-free')!.textContent).not.toContain('Build and edit your own workout plan');
  });

  it("shows the store's price and period only, and a Subscribe button; no slash when the store gave no period", async () => {
    const product = (id: string, price: string, period: string) => ({ id, title: 'StokeForm Pro', price, period, trial: null });
    const { q } = await render({
      billing: providerAnswering({ status: 'available', products: [product('$rc_monthly', '₹199.00', 'month'), product('$rc_x', '₹5.00', '')] }),
    });
    expect(q('offer-product-$rc_monthly')!.textContent).toContain('₹199.00 / month');
    expect(q('offer-buy-$rc_monthly')!.textContent!.trim()).toBe('Subscribe for ₹199.00 / month');
    expect(q('offer-product-$rc_x')!.textContent).not.toContain('/');
    expect(q('offer-restore')).not.toBeNull();
    expect(q('offer-trial-terms')).toBeNull();
  });

  it('not set up: says so, with no price, no buy button and no retry', async () => {
    const { q, el } = await render({ billing: providerAnswering({ status: 'unavailable', reason: 'not-configured' }) });
    expect((q('offer-premium-unavailable') as HTMLButtonElement).disabled).toBe(true);
    expect(el.textContent).toContain("Subscriptions aren't set up in this version of the app");
    expect(el.querySelector('[data-testid^="offer-buy-"]')).toBeNull();
    expect(q('offer-retry')).toBeNull();
  });

  it('outside the Android app: says Pro subscriptions are in the Android app', async () => {
    const { q, el } = await render({ billing: providerAnswering({ status: 'unavailable', reason: 'platform-unsupported' }) });
    expect(el.textContent).toContain('Pro subscriptions are available in the Android app.');
    expect((q('offer-premium-unavailable') as HTMLButtonElement).disabled).toBe(true);
  });

  it('when the store cannot be reached (offline): an honest message and a retry that asks again', async () => {
    let answers: BillingAvailability = { status: 'unavailable', reason: 'store-error' };
    const availability = vi.fn(async () => answers);
    const { q, settle } = await render({ billing: { ...NO_BILLING, id: 'fake', availability } });
    expect(q('offer-store-error')!.textContent).toContain("couldn't load the subscription options");

    answers = { status: 'available', products: [{ id: '$rc_monthly', title: 'StokeForm Pro', price: '₹199.00', period: 'month', trial: null }] };
    q('offer-retry')!.click();
    await settle();
    expect(availability).toHaveBeenCalledTimes(2);
    expect(q('offer-product-$rc_monthly')).not.toBeNull();
    expect(q('offer-store-error')).toBeNull();
  });

  it('a confirmed subscription says "You have Pro" and is not test access', async () => {
    const { q } = await render({ billing: PREMIUM_TEST_BILLING });
    expect(q('offer-premium-active')!.textContent).toContain('You have Pro');
    expect(q('offer-test-active')).toBeNull();
    expect(q('offer-continue-free')!.textContent!.trim()).toBe('Continue');
  });
});

describe('OfferPage: private-testing promo code', () => {
  // The promo sheet is an ion-modal: its content is rendered outside the page element.
  const inSheet = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const open = async (q: Query, settle: () => Promise<void>) => {
    q('offer-promo-toggle')!.click();
    await settle();
  };
  const type = async (settle: () => Promise<void>, value: string) => {
    const input = inSheet('offer-promo-input')!.querySelector('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  const apply = async (settle: () => Promise<void>) => {
    inSheet('offer-promo-apply')!.click();
    await settle();
  };

  it('is offered in a build that turns private testing on, as a row that opens the code sheet', async () => {
    const { q, settle } = await render({ testing: TESTING_ON });
    expect(q('offer-promo-toggle')!.textContent).toContain('Have a promo code?');
    await open(q, settle);
    expect(inSheet('promo-form')).not.toBeNull();
    expect(inSheet('promo-form')!.textContent).toContain('not a subscription');
  });

  it('is not there at all when private testing is off', async () => {
    const { q, el } = await render({ testing: PRIVATE_TESTING_OFF });
    expect(q('offer-promo')).toBeNull();
    expect(q('offer-promo-toggle')).toBeNull();
    expect(el.textContent).not.toContain('promo code');
  });

  it('unlocks test access with the code (any case, spaces ignored): a success state that says test access, never a subscription', async () => {
    const { q, settle } = await render();
    await open(q, settle);
    await type(settle, '  stokeformlab ');
    await apply(settle);

    expect(inSheet('promo-success')!.textContent).toContain('Pro test access is active');
    expect(inSheet('promo-success')!.textContent).toContain('not a subscription');
    expect(q('offer-test-active')!.textContent).toContain('not a subscription');
    expect(q('offer-hero-status')!.textContent).toContain('Pro test access');
    expect(q('offer-premium-active')).toBeNull(); // never reported as a purchase or subscription
    const entitlements = TestBed.inject(EntitlementService);
    expect(entitlements.source()).toBe('test');
    expect(entitlements.entitlement()).toMatchObject({ status: 'free' });
    expect(entitlements.purchase().status).toBe('idle');
    expect(q('offer-continue-free')!.textContent!.trim()).toBe('Continue');
  });

  it('says plainly when the code is wrong or empty, and stays on Free', async () => {
    const { q, settle } = await render();
    await open(q, settle);
    await apply(settle);
    expect(inSheet('offer-promo-input')!.textContent).toContain('Enter a promo code.');

    await type(settle, 'NOTTHECODE');
    await apply(settle);
    expect(inSheet('offer-promo-input')!.textContent).toContain("isn't valid");
    expect(inSheet('promo-success')).toBeNull();
    expect(TestBed.inject(EntitlementService).plan()).toBe('free');
    expect(q('offer-test-active')).toBeNull();
  });

  it('turns off (from the sheet or the notice), back to the real entitlement, and turns on again with the same code', async () => {
    const { q, settle } = await render();
    await open(q, settle);
    await type(settle, 'STOKEFORMLAB');
    await apply(settle);
    expect(TestBed.inject(EntitlementService).plan()).toBe('premium');
    inSheet('promo-turn-off')!.click();
    await settle();
    expect(TestBed.inject(EntitlementService).plan()).toBe('free');
    expect(inSheet('promo-form')).not.toBeNull();

    await type(settle, 'STOKEFORMLAB');
    await apply(settle);
    expect(TestBed.inject(EntitlementService).plan()).toBe('premium');
    q('offer-test-off')!.click();
    await settle();
    expect(TestBed.inject(EntitlementService).plan()).toBe('free');
    expect(q('offer-test-active')).toBeNull();
    expect(TestBed.inject(PrivateTestingService).active()).toBe(false);
  });
});

describe('OfferPage: restore purchases', () => {
  const inSheet = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const openRestore = async (q: Query, settle: () => Promise<void>) => {
    q('offer-restore')!.click();
    await settle();
  };
  const run = async (settle: () => Promise<void>) => {
    inSheet('restore-run')!.click();
    await settle();
  };

  it('without billing: explains there is nothing to restore, and does not pretend to try', async () => {
    const { q, settle } = await render();
    await openRestore(q, settle);
    expect(inSheet('restore-unavailable')!.textContent).toContain("Subscriptions aren't set up");
    expect(inSheet('restore-run')).toBeNull();
  });

  it('restores a subscription the store confirms', async () => {
    let active: ActiveSubscription | null = null;
    const restore = vi.fn(async () => {
      active = { productId: 'pro', active: true, expiresAt: null };
    });
    const { q, settle } = await render({ billing: { ...NO_BILLING, id: 'fake', restore, activeSubscription: async () => active } });
    await openRestore(q, settle);
    await run(settle);
    expect(restore).toHaveBeenCalledOnce();
    expect(inSheet('restore-restored')!.textContent).toContain('Pro is active');
    expect(TestBed.inject(EntitlementService).source()).toBe('subscription');
  });

  it('says so when no subscription is found, and stays on Free', async () => {
    const { q, settle } = await render({ billing: { ...NO_BILLING, id: 'fake' } });
    await openRestore(q, settle);
    await run(settle);
    expect(inSheet('restore-none')!.textContent).toContain('No subscription found');
    expect(inSheet('restore-run')!.textContent!.trim()).toBe('Try again');
    expect(TestBed.inject(EntitlementService).plan()).toBe('free');
  });

  it('when the store cannot be reached: an honest error and a retry; nothing changes', async () => {
    const { q, settle } = await render({
      billing: { ...NO_BILLING, id: 'fake', restore: () => Promise.reject(new Error('offline')), activeSubscription: () => Promise.reject(new Error('offline')) },
    });
    await openRestore(q, settle);
    await run(settle);
    expect(inSheet('restore-failed')!.textContent).toContain("Couldn't reach the store");
    expect(TestBed.inject(EntitlementService).plan()).toBe('free');
  });

  it('shows a busy state while restoring, and ignores a second tap', async () => {
    let finish!: () => void;
    const restore = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { q, settle } = await render({ billing: { ...NO_BILLING, id: 'fake', restore } });
    await openRestore(q, settle);
    inSheet('restore-run')!.click();
    await settle();
    expect((inSheet('restore-run') as HTMLButtonElement).disabled).toBe(true);
    inSheet('restore-run')!.click();
    finish();
    await settle();
    expect(restore).toHaveBeenCalledOnce();
    expect(inSheet('restore-none')).not.toBeNull();
  });
});
