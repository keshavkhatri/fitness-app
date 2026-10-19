import { TestBed } from '@angular/core/testing';
import type { CustomerInfo, PurchasesPackage } from '@revenuecat/purchases-capacitor';

import { BILLING_PROVIDER, NO_BILLING } from '../billing';
import { EntitlementService } from '../entitlement.service';
import { RevenueCatConfig, REVENUECAT_CONFIG, BILLING_PLATFORM_IS_ANDROID, isAndroidPublicKey, revenueCatFrom } from './revenuecat.config';
import { RevenueCatBillingProvider, billingProviderFactory, periodLabel } from './revenuecat-billing.provider';
import { REVENUECAT_SDK, RevenueCatSdk } from './revenuecat-sdk';

const KEY = 'goog_TestKeyForSpecsOnly123';
const FUTURE = '2099-01-01T00:00:00.000Z';
const PAST = '2020-01-01T00:00:00.000Z';

const pack = (identifier: string, priceString: string, subscriptionPeriod: string | null): PurchasesPackage =>
  ({
    identifier,
    packageType: 'MONTHLY',
    product: { identifier: `stokeform_pro:${identifier}`, title: 'StokeForm Pro', priceString, price: 4.99, subscriptionPeriod },
    offeringIdentifier: 'default',
    presentedOfferingContext: {},
    webCheckoutUrl: null,
  }) as unknown as PurchasesPackage;

const MONTHLY = pack('$rc_monthly', '₹199.00', 'P1M');
const ANNUAL = pack('$rc_annual', '₹1,499.00', 'P1Y');

const proInfo = (over: { isActive?: boolean; expirationDate?: string | null } = {}): CustomerInfo =>
  ({
    entitlements: { all: {}, active: { pro: { identifier: 'pro', isActive: over.isActive ?? true, productIdentifier: 'stokeform_pro:monthly', expirationDate: over.expirationDate === undefined ? FUTURE : over.expirationDate } } },
  }) as unknown as CustomerInfo;
const noInfo = { entitlements: { all: {}, active: {} } } as unknown as CustomerInfo;

class FakeSdk implements RevenueCatSdk {
  info: CustomerInfo = noInfo;
  packages: PurchasesPackage[] = [MONTHLY, ANNUAL];
  hasOffering = true;
  listener: ((info: CustomerInfo) => void) | null = null;
  configure = vi.fn(async (_options: { apiKey: string }) => undefined);
  getOfferings = vi.fn(async () => ({ current: this.hasOffering ? { identifier: 'default', availablePackages: this.packages } : null, all: {} }) as never);
  purchasePackage = vi.fn(async (_options: { aPackage: PurchasesPackage }) => ({ customerInfo: this.info }));
  getCustomerInfo = vi.fn(async () => ({ customerInfo: this.info }));
  restorePurchases = vi.fn(async () => ({ customerInfo: this.info }));
  addCustomerInfoUpdateListener = vi.fn(async (listener: (info: CustomerInfo) => void) => {
    this.listener = listener;
    return 'listener-1';
  });
}

function setup({ apiKey = KEY as string | null, android = true } = {}) {
  const sdk = new FakeSdk();
  const config: RevenueCatConfig = { apiKey, entitlementId: 'pro' };
  TestBed.configureTestingModule({
    providers: [
      { provide: REVENUECAT_SDK, useValue: sdk },
      { provide: REVENUECAT_CONFIG, useValue: config },
      { provide: BILLING_PLATFORM_IS_ANDROID, useValue: android },
    ],
  });
  return { sdk, provider: TestBed.inject(RevenueCatBillingProvider) };
}

describe('RevenueCat configuration', () => {
  it('accepts only a Google Play public SDK key (goog_...), nothing else', () => {
    expect(isAndroidPublicKey(KEY)).toBe(true);
    expect(isAndroidPublicKey(`  ${KEY} `)).toBe(true);
    for (const bad of [null, undefined, '', 'goog_', 'goog_short', 'appl_TestKeyForSpecsOnly123', 'sk_TestKeyForSpecsOnly123456', 'TestKeyForSpecsOnly123']) {
      expect(isAndroidPublicKey(bad)).toBe(false);
    }
  });

  it('reads the key and entitlement from an environment; a missing block means not configured, entitlement "pro"', () => {
    const base = { production: true, apiBaseUrl: null, inbodyExtractionEndpoint: null, exerciseMediaBaseUrl: null };
    expect(revenueCatFrom(base)).toEqual({ apiKey: null, entitlementId: 'pro' });
    expect(revenueCatFrom({ ...base, revenueCat: { androidApiKey: KEY, entitlementId: 'plus' } })).toEqual({ apiKey: KEY, entitlementId: 'plus' });
    expect(revenueCatFrom({ ...base, revenueCat: { androidApiKey: 'not-a-key', entitlementId: 'pro' } }).apiKey).toBeNull();
  });
});

describe('billingProviderFactory (what BILLING_PROVIDER is in the app)', () => {
  it('is NO_BILLING until a valid key is configured: nothing is bought, nothing is Premium', () => {
    TestBed.configureTestingModule({ providers: [{ provide: REVENUECAT_CONFIG, useValue: { apiKey: null, entitlementId: 'pro' } }] });
    expect(TestBed.runInInjectionContext(billingProviderFactory)).toBe(NO_BILLING);
  });

  it('is the RevenueCat provider once a key is configured', () => {
    const sdk = new FakeSdk();
    TestBed.configureTestingModule({
      providers: [
        { provide: REVENUECAT_CONFIG, useValue: { apiKey: KEY, entitlementId: 'pro' } },
        { provide: REVENUECAT_SDK, useValue: sdk },
        { provide: BILLING_PLATFORM_IS_ANDROID, useValue: true },
      ],
    });
    const provider = TestBed.runInInjectionContext(billingProviderFactory);
    expect(provider.id).toBe('revenuecat');
    expect(sdk.configure).not.toHaveBeenCalled(); // nothing starts until the store is asked
  });
});

describe('periodLabel', () => {
  it('words the store billing period; anything else is left out rather than guessed', () => {
    expect(periodLabel('P1M')).toBe('month');
    expect(periodLabel('P1Y')).toBe('year');
    expect(periodLabel('P1W')).toBe('week');
    expect(periodLabel('P3M')).toBe('3 months');
    expect(periodLabel('P6M')).toBe('6 months');
    expect(periodLabel('P1M15D')).toBe('');
    expect(periodLabel(null)).toBe('');
  });
});

describe('RevenueCatBillingProvider', () => {
  describe('initialization', () => {
    it('without a valid public key: not configured, the SDK is never started, nothing can be bought', async () => {
      const { sdk, provider } = setup({ apiKey: null });
      expect(await provider.availability()).toEqual({ status: 'unavailable', reason: 'not-configured' });
      expect(await provider.purchase('$rc_monthly')).toEqual({ kind: 'failed', reason: 'not-available' });
      expect(await provider.activeSubscription()).toBeNull();
      await provider.restore();
      expect(sdk.configure).not.toHaveBeenCalled();
    });

    it('outside Android: platform-unsupported, the SDK is never started', async () => {
      const { sdk, provider } = setup({ android: false });
      expect(await provider.availability()).toEqual({ status: 'unavailable', reason: 'platform-unsupported' });
      expect(await provider.activeSubscription()).toBeNull();
      expect(sdk.configure).not.toHaveBeenCalled();
    });

    it('configures the SDK exactly once, with the public key, however many calls follow', async () => {
      const { sdk, provider } = setup();
      await Promise.all([provider.availability(), provider.activeSubscription(), provider.availability()]);
      await provider.restore();
      expect(sdk.configure).toHaveBeenCalledOnce();
      expect(sdk.configure).toHaveBeenCalledWith({ apiKey: KEY });
    });

    it('a failed configuration is reported as a store error and tried again on the next call', async () => {
      const { sdk, provider } = setup();
      sdk.configure.mockRejectedValueOnce(new Error('offline'));
      expect(await provider.availability()).toEqual({ status: 'unavailable', reason: 'store-error' });
      expect((await provider.availability()).status).toBe('available');
      expect(sdk.configure).toHaveBeenCalledTimes(2);
    });
  });

  describe('offerings and products', () => {
    it("lists the current offering's packages with the store's own price and period, never a trial", async () => {
      const { provider } = setup();
      expect(await provider.availability()).toEqual({
        status: 'available',
        products: [
          { id: '$rc_monthly', title: 'StokeForm Pro', price: '₹199.00', period: 'month', trial: null },
          { id: '$rc_annual', title: 'StokeForm Pro', price: '₹1,499.00', period: 'year', trial: null },
        ],
      });
    });

    it('no current offering, or one with no packages, is a set-up gap (not-configured), not an outage', async () => {
      const first = setup();
      first.sdk.hasOffering = false;
      expect(await first.provider.availability()).toEqual({ status: 'unavailable', reason: 'not-configured' });
      TestBed.resetTestingModule();
      const second = setup();
      second.sdk.packages = [];
      expect(await second.provider.availability()).toEqual({ status: 'unavailable', reason: 'not-configured' });
    });

    it('a failure loading offerings is a store error', async () => {
      const { sdk, provider } = setup();
      sdk.getOfferings.mockRejectedValueOnce(new Error('network'));
      expect(await provider.availability()).toEqual({ status: 'unavailable', reason: 'store-error' });
    });
  });

  describe('purchases', () => {
    it('buys the chosen package and reports "completed" (which grants nothing by itself)', async () => {
      const { sdk, provider } = setup();
      await provider.availability();
      expect(await provider.purchase('$rc_annual')).toEqual({ kind: 'completed' });
      expect(sdk.purchasePackage).toHaveBeenCalledWith({ aPackage: ANNUAL });
    });

    it('looks the package up itself when offerings have not been loaded yet', async () => {
      const { sdk, provider } = setup();
      expect(await provider.purchase('$rc_monthly')).toEqual({ kind: 'completed' });
      expect(sdk.purchasePackage).toHaveBeenCalledWith({ aPackage: MONTHLY });
    });

    it.each([
      ['cancelled by the user (error code 1)', { code: '1' }, { kind: 'cancelled' }],
      ['cancelled (userCancelled flag)', { userCancelled: true }, { kind: 'cancelled' }],
      ['payment pending (error code 20)', { code: '20' }, { kind: 'pending' }],
      ['purchase not allowed (error code 3)', { code: '3' }, { kind: 'failed', reason: 'payment-declined' }],
      ['product not available (error code 5)', { code: '5' }, { kind: 'failed', reason: 'not-available' }],
      ['network error (error code 10)', { code: '10' }, { kind: 'failed', reason: 'store-error' }],
      ['an unknown error', new Error('boom'), { kind: 'failed', reason: 'store-error' }],
      ['already owned (error code 6): the entitlement is read again to decide', { code: '6' }, { kind: 'completed' }],
    ])('%s', async (_name, error, expected) => {
      const { sdk, provider } = setup();
      sdk.purchasePackage.mockRejectedValueOnce(error);
      expect(await provider.purchase('$rc_monthly')).toEqual(expected);
    });

    it('an unknown package is not available', async () => {
      const { sdk, provider } = setup();
      expect(await provider.purchase('$rc_weekly')).toEqual({ kind: 'failed', reason: 'not-available' });
      expect(sdk.purchasePackage).not.toHaveBeenCalled();
    });

    it('taps while a purchase is running join it: one store purchase, not two', async () => {
      const { sdk, provider } = setup();
      let finish!: () => void;
      sdk.purchasePackage.mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve({ customerInfo: noInfo }))));
      const first = provider.purchase('$rc_monthly');
      const second = provider.purchase('$rc_monthly');
      await vi.waitFor(() => expect(sdk.purchasePackage).toHaveBeenCalledOnce());
      finish();
      expect(await first).toEqual({ kind: 'completed' });
      expect(await second).toEqual({ kind: 'completed' });
      expect(sdk.purchasePackage).toHaveBeenCalledOnce();
    });
  });

  describe('customer entitlement', () => {
    it('reports the Pro entitlement as the active subscription, with its expiry', async () => {
      const { sdk, provider } = setup();
      sdk.info = proInfo();
      expect(await provider.activeSubscription()).toEqual({ productId: 'stokeform_pro:monthly', active: true, expiresAt: FUTURE });
    });

    it('no Pro entitlement means no subscription', async () => {
      const { provider } = setup();
      expect(await provider.activeSubscription()).toBeNull();
    });

    it('an entitlement that is not active is reported inactive', async () => {
      const { sdk, provider } = setup();
      sdk.info = proInfo({ isActive: false });
      expect((await provider.activeSubscription())?.active).toBe(false);
    });

    it('reads only the configured entitlement id', async () => {
      const { sdk, provider } = setup();
      sdk.info = { entitlements: { all: {}, active: { other: { isActive: true, productIdentifier: 'x', expirationDate: null } } } } as unknown as CustomerInfo;
      expect(await provider.activeSubscription()).toBeNull();
    });

    it('restore asks the store to restore purchases', async () => {
      const { sdk, provider } = setup();
      await provider.restore();
      expect(sdk.restorePurchases).toHaveBeenCalledOnce();
    });

    it('tells a watcher whenever the customer info changes', async () => {
      const { sdk, provider } = setup();
      const changed = vi.fn();
      provider.watch(changed);
      await vi.waitFor(() => expect(sdk.addCustomerInfoUpdateListener).toHaveBeenCalledOnce());
      sdk.listener?.(proInfo());
      expect(changed).toHaveBeenCalledOnce();
    });
  });

  describe('through EntitlementService (the only thing that decides Pro)', () => {
    function entitlements(options?: Parameters<typeof setup>[0]) {
      const made = setup(options);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: REVENUECAT_SDK, useValue: made.sdk },
          { provide: REVENUECAT_CONFIG, useValue: { apiKey: options?.apiKey === undefined ? KEY : options.apiKey, entitlementId: 'pro' } },
          { provide: BILLING_PLATFORM_IS_ANDROID, useValue: options?.android ?? true },
          { provide: BILLING_PROVIDER, useFactory: billingProviderFactory },
        ],
      });
      return { sdk: made.sdk, service: TestBed.inject(EntitlementService) };
    }

    it('with nothing configured everyone is Free and a purchase attempt never makes anyone Pro', async () => {
      const { service } = entitlements({ apiKey: null });
      expect(await service.refresh()).toEqual({ status: 'free', reason: 'default' });
      expect(await service.buy('$rc_monthly')).toEqual({ status: 'failed', reason: 'not-available' });
      expect(service.plan()).toBe('free');
      expect(service.source()).toBe('none');
    });

    it('an active Pro entitlement is Pro, from a subscription (not test access)', async () => {
      const { sdk, service } = entitlements();
      sdk.info = proInfo();
      await service.refresh();
      expect(service.plan()).toBe('premium');
      expect(service.source()).toBe('subscription');
      expect(service.entitlement()).toMatchObject({ status: 'premium', productId: 'stokeform_pro:monthly' });
    });

    it('a purchase the store completed counts only once RevenueCat reports the entitlement', async () => {
      const { sdk, service } = entitlements();
      expect(await service.buy('$rc_monthly')).toEqual({ status: 'failed', reason: 'not-confirmed' });
      expect(service.plan()).toBe('free');
      sdk.info = proInfo();
      expect(await service.buy('$rc_monthly')).toEqual({ status: 'idle' });
      expect(service.plan()).toBe('premium');
    });

    it('cancelled, pending and failed purchases leave the user on Free', async () => {
      const { sdk, service } = entitlements();
      sdk.purchasePackage.mockRejectedValueOnce({ code: '1' });
      expect(await service.buy('$rc_monthly')).toEqual({ status: 'cancelled' });
      sdk.purchasePackage.mockRejectedValueOnce({ code: '20' });
      expect(await service.buy('$rc_monthly')).toEqual({ status: 'pending', productId: '$rc_monthly' });
      service.dismissPurchase();
      expect(service.purchase().status).toBe('pending');
      sdk.purchasePackage.mockRejectedValueOnce(new Error('boom'));
      expect(service.plan()).toBe('free');
    });

    it('an expired or absent subscription is Free', async () => {
      const { sdk, service } = entitlements();
      sdk.info = proInfo({ expirationDate: PAST });
      expect(await service.refresh()).toEqual({ status: 'free', reason: 'expired' });
      sdk.info = noInfo;
      expect(await service.refresh()).toEqual({ status: 'free', reason: 'default' });
      expect(service.plan()).toBe('free');
    });

    it('an error reading the entitlement is Free (unverified), never Pro', async () => {
      const { sdk, service } = entitlements();
      sdk.getCustomerInfo.mockRejectedValueOnce(new Error('offline'));
      expect(await service.refresh()).toEqual({ status: 'free', reason: 'unverified' });
      expect(service.plan()).toBe('free');
    });

    it('restoring purchases refreshes the entitlement', async () => {
      const { sdk, service } = entitlements();
      sdk.info = proInfo();
      expect(await service.restore()).toMatchObject({ status: 'premium' });
      expect(sdk.restorePurchases).toHaveBeenCalledOnce();
      expect(service.plan()).toBe('premium');
    });

    it('a customer-info update (a renewal, an expiry or a refund) refreshes the entitlement by itself', async () => {
      const { sdk, service } = entitlements();
      await service.refresh();
      await vi.waitFor(() => expect(sdk.addCustomerInfoUpdateListener).toHaveBeenCalled());
      expect(service.plan()).toBe('free');

      sdk.info = proInfo();
      sdk.listener?.(sdk.info);
      await vi.waitFor(() => expect(service.plan()).toBe('premium'));

      sdk.info = noInfo; // refunded or lapsed
      sdk.listener?.(sdk.info);
      await vi.waitFor(() => expect(service.plan()).toBe('free'));
    });
  });
});
