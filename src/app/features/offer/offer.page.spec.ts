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
import { PlanIntentService } from '../../core/workout/plan-intent.service';
import { OfferPage } from './offer.page';

const TESTING_ON: PrivateTestingConfig = { enabled: true, promoCode: 'STOKEFORMLAB' };

async function render({
  billing = NO_BILLING,
  next,
  testing = TESTING_ON,
  buildOwn = false,
}: { billing?: BillingProvider; next?: string; testing?: PrivateTestingConfig; buildOwn?: boolean } = {}) {
  const storage = new MemoryKeyValueStorage();
  if (buildOwn) {
    storage.values.set('stokeform.plan-intent', JSON.stringify({ version: 1, intent: 'custom' }));
  }
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

const providerAnswering = (availability: BillingAvailability): BillingProvider => ({ ...NO_BILLING, id: 'fake', availability: async () => availability });
type Query = (id: string) => HTMLElement | null;

/** Plans view → Pro tab → Continue → Go Pro. */
async function toPro(q: Query, settle: () => Promise<void>) {
  q('offer-tab-pro')!.click();
  await settle();
  q('offer-continue-pro')!.click();
  await settle();
}

describe('OfferPage: plans', () => {
  it('shows Free and Pro tabs (Pro marked Most Popular) and what each includes', async () => {
    const { q, el } = await render();
    expect(q('offer-title')!.textContent).toContain('Unlock Your Full Potential');
    expect(q('offer-tab-pro')!.textContent).toContain('Most Popular');
    expect(q('offer-tab-pro')!.getAttribute('aria-checked')).toBe('true');
    expect(q('offer-free')!.textContent).toContain('Generated workout plans');
    expect(q('offer-compare')!.textContent).toContain('Custom workout plan editor');
    // Only what is built: no invented Pro features.
    for (const unbuilt of ['Priority support', 'Advanced programming', 'Back up and sync', 'Progress photos']) {
      expect(el.textContent).not.toContain(unbuilt);
    }
    expect(el.textContent).not.toContain('Premium');
  });

  it('Free + Continue records the choice, ends the first-run offer and goes where the user was headed', async () => {
    const { q, settle, root, storage } = await render({ next: '/you' });
    q('offer-tab-free')!.click();
    await settle();
    q('offer-continue-free')!.click();
    await settle();
    expect(root).toHaveBeenCalledWith('/you');
    expect(await TestBed.inject(FirstRunOfferService).isPending()).toBe(false);
    expect(JSON.parse(storage.values.get('stokeform.plan-choice')!)).toMatchObject({ choice: 'free', accountId: null });
  });

  it('an outside link in `next` goes Home instead', async () => {
    const { q, settle, root } = await render({ next: 'https://example.test/phish' });
    q('offer-tab-free')!.click();
    await settle();
    q('offer-continue-free')!.click();
    await settle();
    expect(root).toHaveBeenCalledWith('/home');
  });

  it('with Pro picked, Continue with Free is still one tap away; with Free picked there is no Pro button', async () => {
    const { q, settle } = await render();
    expect(q('offer-continue-pro')!.textContent!.trim()).toBe('Continue with Pro');
    expect(q('offer-continue-free')!.textContent!.trim()).toBe('Continue with Free');
    q('offer-tab-free')!.click();
    await settle();
    expect(q('offer-continue-pro')).toBeNull();
  });

  it('Go Pro offers Continue with Free too (nothing to buy is never a dead end)', async () => {
    const { q, settle, root } = await render();
    await toPro(q, settle);
    q('offer-continue-free')!.click();
    await settle();
    expect(root).toHaveBeenCalledWith('/home');
  });

  it('Pro + Continue opens Go Pro, and back returns to the plans', async () => {
    const { q, settle } = await render();
    await toPro(q, settle);
    expect(q('offer-title')!.textContent).toContain('Go Pro');
    expect(q('offer-pro-features')!.textContent).toContain('Custom workout plan editor');
    q('offer-pro-back')!.click();
    await settle();
    expect(q('offer-tabs')).not.toBeNull();
  });
});

describe('OfferPage: "Build my own" chosen during setup', () => {
  it('opens with Pro picked; staying on Free goes to the Train tab (which reminds them), not Home', async () => {
    const { q, settle, root } = await render({ buildOwn: true, next: '/home' });
    q('offer-tab-free')!.click();
    await settle();
    q('offer-tab-pro')!.click();
    await settle();
    expect(q('offer-tab-pro')!.getAttribute('aria-checked')).toBe('true');
    q('offer-continue-free')!.click();
    await settle();
    expect(root).toHaveBeenCalledWith('/workout');
    expect(TestBed.inject(PlanIntentService).intent()).toBe('custom');
  });

  it('with Pro (here a promo code), Continue goes straight to the custom plan editor and the choice is used up', async () => {
    const { q, settle, root, storage } = await render({ buildOwn: true });
    const input = q('offer-promo-input') as HTMLInputElement;
    input.value = 'STOKEFORMLAB';
    input.dispatchEvent(new Event('input'));
    await settle();
    q('offer-promo-apply')!.click();
    await settle();
    q('offer-continue-free')!.click();
    await settle();
    expect(root).toHaveBeenCalledWith('/workout/plan/edit');
    expect(storage.values.has('stokeform.plan-intent')).toBe(false);
  });

  it('without that choice, nothing changes: Continue with Free goes where the user was headed', async () => {
    const { q, settle, root } = await render({ next: '/home' });
    q('offer-continue-free')!.click();
    await settle();
    expect(root).toHaveBeenCalledWith('/home');
  });
});

describe('OfferPage: the Pro price', () => {
  it('with nothing configured: a preview price that cannot be bought; Subscribe says so and charges nothing', async () => {
    const { q, settle } = await render();
    await toPro(q, settle);
    expect(q('offer-product-preview-pro-monthly')!.textContent).toContain('₹299 / month');
    expect(q('offer-product-preview-pro-monthly')!.textContent).toContain('Cancel anytime');
    expect(q('offer-premium-unavailable')).toBeNull();
    q('offer-buy-preview-pro-monthly')!.click();
    await settle();
    expect(q('offer-premium-unavailable')!.textContent).toContain("aren't live in this build");
    expect(TestBed.inject(EntitlementService).plan()).toBe('free');
    expect(TestBed.inject(EntitlementService).purchase().status).toBe('idle');
  });

  it("with a provider: shows the store's own price and trial terms; a tap that isn't confirmed keeps Free", async () => {
    let confirmed: ActiveSubscription | null = null;
    const purchase = vi.fn(async () => ({ kind: 'completed' }) as const);
    const billing: BillingProvider = {
      ...NO_BILLING,
      id: 'fake',
      availability: async () => ({
        status: 'available',
        products: [{ id: 'monthly', title: 'Pro', price: '£4.99', period: 'month', trial: { length: '7 days', renewalPrice: '£4.99/month', cancellationTerms: 'Cancel any time before it ends.' } }],
      }),
      purchase,
      activeSubscription: async () => confirmed,
    };
    const { q, settle, root, el } = await render({ billing });
    await toPro(q, settle);
    expect(q('offer-product-monthly')!.textContent).toContain('£4.99');
    expect(q('offer-product-monthly')!.textContent).toContain('Free for 7 days, then £4.99/month.');
    expect(el.textContent).not.toContain('₹299');

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

  it("shows the store's price and period only; no slash when the store gave no period", async () => {
    const product = (id: string, price: string, period: string) => ({ id, title: 'StokeForm Pro', price, period, trial: null });
    const { q, settle } = await render({
      billing: providerAnswering({ status: 'available', products: [product('$rc_monthly', '₹199.00', 'month'), product('$rc_x', '₹5.00', '')] }),
    });
    await toPro(q, settle);
    expect(q('offer-product-$rc_monthly')!.textContent).toContain('₹199.00 / month');
    expect(q('offer-buy-$rc_monthly')!.textContent!.trim()).toBe('Subscribe');
    expect(q('offer-product-$rc_x')!.textContent).not.toContain('/');
    expect(q('offer-restore')).not.toBeNull();
  });

  it('when the store cannot be reached (offline): an honest message and a retry that asks again', async () => {
    let answers: BillingAvailability = { status: 'unavailable', reason: 'store-error' };
    const availability = vi.fn(async () => answers);
    const { q, settle } = await render({ billing: { ...NO_BILLING, id: 'fake', availability } });
    await toPro(q, settle);
    expect(q('offer-store-error')!.textContent).toContain("couldn't load the subscription options");
    expect(q('offer-product-preview-pro-monthly')).toBeNull();

    answers = { status: 'available', products: [{ id: '$rc_monthly', title: 'StokeForm Pro', price: '₹199.00', period: 'month', trial: null }] };
    q('offer-retry')!.click();
    await settle();
    expect(availability).toHaveBeenCalledTimes(2);
    expect(q('offer-product-$rc_monthly')).not.toBeNull();
    expect(q('offer-store-error')).toBeNull();
  });

  it('a confirmed subscription says "You have Pro" and is not test access; Continue goes on', async () => {
    const { q, settle, root } = await render({ billing: PREMIUM_TEST_BILLING });
    expect(q('offer-premium-active')!.textContent).toContain('You have Pro');
    expect(q('offer-test-active')).toBeNull();
    q('offer-continue-free')!.click();
    await settle();
    expect(root).toHaveBeenCalled();
  });
});

describe('OfferPage: private-testing promo code', () => {
  const type = async (q: Query, settle: () => Promise<void>, value: string) => {
    const input = q('offer-promo-input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  const apply = async (q: Query, settle: () => Promise<void>) => {
    q('offer-promo-apply')!.click();
    await settle();
  };

  it('is offered inline in a build that turns private testing on', async () => {
    const { q } = await render({ testing: TESTING_ON });
    expect(q('offer-promo')!.textContent).toContain('Have a promo code?');
    expect(q('offer-promo')!.textContent).toContain('private testing');
  });

  it('is not there at all when private testing is off', async () => {
    const { q, el } = await render({ testing: PRIVATE_TESTING_OFF });
    expect(q('offer-promo')).toBeNull();
    expect(el.textContent).not.toContain('promo code');
  });

  it('unlocks test access with the code (any case, spaces ignored): a success screen that says test access, never a subscription', async () => {
    const { q, settle } = await render();
    await type(q, settle, '  stokeformlab ');
    await apply(q, settle);

    expect(q('promo-success')!.textContent).toContain('Pro Test Access Activated!');
    expect(q('promo-success')!.textContent).toContain('not a real subscription');
    expect(q('promo-success')!.textContent).toContain('Not a subscription');
    const entitlements = TestBed.inject(EntitlementService);
    expect(entitlements.source()).toBe('test');
    expect(entitlements.entitlement()).toMatchObject({ status: 'free' });
    expect(entitlements.purchase().status).toBe('idle');
    expect(q('offer-continue-free')!.textContent!.trim()).toBe('Continue');
  });

  it('says plainly when the code is wrong or empty, and stays on Free', async () => {
    const { q, settle, el } = await render();
    await apply(q, settle);
    expect(el.textContent).toContain('Enter a promo code.');

    await type(q, settle, 'NOTTHECODE');
    await apply(q, settle);
    expect(el.textContent).toContain("isn't valid");
    expect(q('promo-success')).toBeNull();
    expect(TestBed.inject(EntitlementService).plan()).toBe('free');
  });

  it('turns off from the success screen, back to the real entitlement, and turns on again with the same code', async () => {
    const { q, settle } = await render();
    await type(q, settle, 'STOKEFORMLAB');
    await apply(q, settle);
    expect(TestBed.inject(EntitlementService).plan()).toBe('premium');
    q('offer-test-off')!.click();
    await settle();
    expect(TestBed.inject(EntitlementService).plan()).toBe('free');
    expect(q('offer-promo')).not.toBeNull();

    await type(q, settle, 'STOKEFORMLAB');
    await apply(q, settle);
    expect(TestBed.inject(EntitlementService).plan()).toBe('premium');
    expect(TestBed.inject(PrivateTestingService).active()).toBe(true);
  });
});

describe('OfferPage: restore purchases', () => {
  const inSheet = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const openRestore = async (q: Query, settle: () => Promise<void>) => {
    await toPro(q, settle);
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
