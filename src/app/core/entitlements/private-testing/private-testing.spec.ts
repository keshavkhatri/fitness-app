import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';

import { environment as developmentEnvironment } from '../../../../environments/environment';
import { environment as releaseEnvironment } from '../../../../environments/environment.prod';
import { AppEnvironment } from '../../../../environments/environment.model';
import { requireCustomPlanAccess } from '../../../features/workout/custom-plan/custom-plan.guard';
import { KeyValueStorage } from '../../storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../storage/testing/memory-key-value-storage';
import { canAccess } from '../access-policy';
import { BILLING_PROVIDER } from '../billing';
import { EntitlementService } from '../entitlement.service';
import { PREMIUM_TEST_BILLING } from '../testing/premium-billing';
import { PRIVATE_TESTING_CONFIG, PRIVATE_TESTING_OFF, PrivateTestingConfig, privateTestingFrom } from './private-testing.config';
import { PrivateTestingService } from './private-testing.service';

const ON: PrivateTestingConfig = { enabled: true, promoCode: 'STOKEFORMLAB' };
const STORAGE_KEY = 'stokeform.test-access';
const base: AppEnvironment = { production: true, apiBaseUrl: null, inbodyExtractionEndpoint: null, exerciseMediaBaseUrl: null };

function setup(config: PrivateTestingConfig = ON, storage = new MemoryKeyValueStorage(), extra: unknown[] = []) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: PRIVATE_TESTING_CONFIG, useValue: config }, { provide: KeyValueStorage, useValue: storage }, ...(extra as never[])],
  });
  return { storage, testing: TestBed.inject(PrivateTestingService), entitlements: TestBed.inject(EntitlementService) };
}

describe('private-testing configuration', () => {
  it('is off unless an environment explicitly turns it on (omitted, disabled, or without a code)', () => {
    expect(privateTestingFrom(base)).toEqual(PRIVATE_TESTING_OFF);
    expect(privateTestingFrom({ ...base, privateTesting: { enabled: false, promoCode: 'STOKEFORMLAB' } })).toEqual(PRIVATE_TESTING_OFF);
    expect(privateTestingFrom({ ...base, privateTesting: { enabled: true, promoCode: '   ' } })).toEqual(PRIVATE_TESTING_OFF);
    expect(privateTestingFrom({ ...base, privateTesting: { enabled: true, promoCode: ' STOKEFORMLAB ' } })).toEqual(ON);
  });

  it('debug and development builds (environment.ts) have it on, with the default code', () => {
    expect(privateTestingFrom(developmentEnvironment)).toEqual(ON);
  });

  it('the live build (environment.prod.ts, a production-mode build) has it on while testing is private, with the same code', () => {
    expect(releaseEnvironment.production).toBe(true);
    expect(privateTestingFrom(releaseEnvironment)).toEqual(ON);
  });

  it('switching the flag off in the live build turns the promo off: no entry, no test access', () => {
    const off = { ...releaseEnvironment, privateTesting: { ...releaseEnvironment.privateTesting, enabled: false } };
    expect(privateTestingFrom(off)).toEqual(PRIVATE_TESTING_OFF);
    const removed = { ...releaseEnvironment } as AppEnvironment & { privateTesting?: unknown };
    delete removed.privateTesting;
    expect(privateTestingFrom(removed)).toEqual(PRIVATE_TESTING_OFF);
  });

  it('the app reads the build\'s own environment by default (development in tests)', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(PRIVATE_TESTING_CONFIG)).toEqual(privateTestingFrom(developmentEnvironment));
  });
});

describe('PrivateTestingService', () => {
  it('unlocks with the code; case and surrounding spaces do not matter', async () => {
    for (const typed of ['STOKEFORMLAB', 'stokeformlab', 'StokeFormLab', '  STOKEFORMLAB  ', '\tstokeformlab\n']) {
      TestBed.resetTestingModule();
      const { testing } = setup();
      expect(await testing.redeem(typed)).toBe('activated');
      expect(testing.active()).toBe(true);
    }
  });

  it('refuses a wrong or empty code and stays off', async () => {
    const { testing } = setup();
    expect(await testing.redeem('STOKEFORM')).toBe('invalid');
    expect(await testing.redeem('STOKEFORMLAB1')).toBe('invalid');
    expect(await testing.redeem('')).toBe('empty');
    expect(await testing.redeem('   ')).toBe('empty');
    expect(testing.active()).toBe(false);
  });

  it('the code is reusable: redeeming again works, on and off, any number of times', async () => {
    const { testing } = setup();
    for (let i = 0; i < 3; i++) {
      expect(await testing.redeem('stokeformlab')).toBe('activated');
      expect(testing.active()).toBe(true);
      expect(await testing.redeem('stokeformlab')).toBe('activated');
      await testing.deactivate();
      expect(testing.active()).toBe(false);
    }
  });

  it('survives a restart, and starts over (type the code again) after the stored switch is gone', async () => {
    const { storage, testing } = setup();
    await testing.redeem('STOKEFORMLAB');
    expect(JSON.parse(storage.values.get(STORAGE_KEY)!)).toEqual({ version: 1, active: true });

    TestBed.resetTestingModule();
    const restarted = setup(ON, storage).testing;
    expect(restarted.active()).toBe(false); // not read yet
    await restarted.restore();
    expect(restarted.active()).toBe(true);

    storage.values.delete(STORAGE_KEY); // a reinstall
    TestBed.resetTestingModule();
    const reinstalled = setup(ON, storage).testing;
    await reinstalled.restore();
    expect(reinstalled.active()).toBe(false);
    expect(await reinstalled.redeem('STOKEFORMLAB')).toBe('activated');
  });

  it('turning it off clears the stored switch', async () => {
    const { storage, testing } = setup();
    await testing.redeem('STOKEFORMLAB');
    await testing.deactivate();
    expect(storage.values.has(STORAGE_KEY)).toBe(false);
    expect(testing.active()).toBe(false);
  });

  it('unreadable stored data means off', async () => {
    const storage = new MemoryKeyValueStorage();
    storage.values.set(STORAGE_KEY, '{oops');
    const { testing } = setup(ON, storage);
    await testing.restore();
    expect(testing.active()).toBe(false);
    storage.values.set(STORAGE_KEY, JSON.stringify({ version: 99, active: true }));
    TestBed.resetTestingModule();
    const other = setup(ON, storage).testing;
    await other.restore();
    expect(other.active()).toBe(false);
  });

  it('a failed write keeps it on for this session only', async () => {
    const storage = new MemoryKeyValueStorage();
    storage.failWrites = true;
    const { testing } = setup(ON, storage);
    expect(await testing.redeem('STOKEFORMLAB')).toBe('activated');
    expect(testing.active()).toBe(true);
  });

  it('in a build without private testing there is no promo: nothing redeems and a stored switch is ignored', async () => {
    const storage = new MemoryKeyValueStorage();
    storage.values.set(STORAGE_KEY, JSON.stringify({ version: 1, active: true }));
    const { testing } = setup(PRIVATE_TESTING_OFF, storage);
    expect(testing.available).toBe(false);
    await testing.restore();
    expect(await testing.redeem('STOKEFORMLAB')).toBe('unavailable');
    expect(testing.active()).toBe(false);
  });
});

describe('test access versus a real subscription (EntitlementService)', () => {
  it('unlocks Pro as test access: not a subscription, and the real entitlement is untouched', async () => {
    const { testing, entitlements } = setup();
    await entitlements.refresh();
    expect(entitlements.plan()).toBe('free');

    await testing.redeem('STOKEFORMLAB');
    expect(entitlements.plan()).toBe('premium');
    expect(entitlements.source()).toBe('test');
    expect(entitlements.testAccess()).toBe(true);
    expect(entitlements.entitlement()).toEqual({ status: 'free', reason: 'default' }); // never "premium"
    expect(entitlements.purchase().status).toBe('idle'); // no purchase happened
  });

  it('turning test access off returns to the actual entitlement, Free', async () => {
    const { testing, entitlements } = setup();
    await testing.redeem('STOKEFORMLAB');
    await testing.deactivate();
    expect(entitlements.plan()).toBe('free');
    expect(entitlements.source()).toBe('none');
  });

  it('a real subscription is reported as a subscription even while test access is on, and outlives turning it off', async () => {
    const { testing, entitlements } = setup(ON, new MemoryKeyValueStorage(), [{ provide: BILLING_PROVIDER, useValue: PREMIUM_TEST_BILLING }]);
    await entitlements.refresh();
    await testing.redeem('STOKEFORMLAB');
    expect(entitlements.source()).toBe('subscription');
    await testing.deactivate();
    expect(entitlements.source()).toBe('subscription');
    expect(entitlements.plan()).toBe('premium');
  });

  it('restores a saved test-access switch when the entitlement is read at startup', async () => {
    const storage = new MemoryKeyValueStorage();
    storage.values.set(STORAGE_KEY, JSON.stringify({ version: 1, active: true }));
    const { entitlements } = setup(ON, storage);
    expect(entitlements.plan()).toBe('free');
    await entitlements.refresh();
    expect(entitlements.plan()).toBe('premium');
  });

  it('opens the custom plan with test access, and not without it; Free features stay Free either way', async () => {
    const { testing, entitlements } = setup();
    const guard = () => TestBed.runInInjectionContext(() => requireCustomPlanAccess({} as never, {} as never)) as Promise<boolean | UrlTree>;
    const url = (result: boolean | UrlTree) => (result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result);

    expect(url(await guard())).toBe('/offer?next=%2Fworkout');
    expect(canAccess('custom-workout-plan', entitlements.plan())).toBe(false);

    await testing.redeem('STOKEFORMLAB');
    expect(await guard()).toBe(true);
    expect(canAccess('custom-workout-plan', entitlements.plan())).toBe(true);

    for (const free of ['workout-plan', 'exercise-library', 'workout-logging', 'workout-history'] as const) {
      expect(canAccess(free, 'free')).toBe(true);
    }
  });

  it('in a build without private testing the custom plan stays closed', async () => {
    const { entitlements } = setup(PRIVATE_TESTING_OFF);
    await entitlements.refresh();
    expect(entitlements.plan()).toBe('free');
    expect(canAccess('custom-workout-plan', entitlements.plan())).toBe(false);
  });
});
