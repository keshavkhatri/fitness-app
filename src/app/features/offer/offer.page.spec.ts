import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { environment } from '../../../environments/environment';
import { BILLING_PROVIDER, BillingProvider, NO_BILLING } from '../../core/entitlements/billing';
import { FirstRunOfferService } from '../../core/entitlements/first-run-offer.service';
import { PREMIUM_TEST_BILLING } from '../../core/entitlements/testing/premium-billing';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { PlanIntentService } from '../../core/workout/plan-intent.service';
import { OfferPage } from './offer.page';

async function render({ billing = NO_BILLING, next, buildOwn = false }: { billing?: BillingProvider; next?: string; buildOwn?: boolean } = {}) {
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
  const continueFree = async () => {
    q('offer-continue-free')!.click();
    await settle();
  };
  return { el, q, root, storage, continueFree };
}

/** Runs `body` as the live app does today: Pro not sold. */
async function freeLaunch(body: () => Promise<void>) {
  const env = environment as { paidPlans: boolean };
  env.paidPlans = false;
  try {
    await body();
  } finally {
    env.paidPlans = true;
  }
}

describe('OfferPage (free launch)', () => {
  it('says StokeForm is free, lists what is included, and offers only Continue for free', async () => {
    const { el, q } = await render();
    expect(q('offer-title')!.textContent).toContain('Everything is free');
    expect(q('offer-features')!.textContent).toContain('Workout plans');
    expect(q('offer-continue-free')!.textContent!.trim()).toBe('Continue for free');
    expect(el.querySelectorAll('button').length).toBe(1);
    // Nothing about paying: no price, subscription, promo code or restore.
    for (const paid of [/\bPro\b/, /₹/, /subscribe/i, /promo/i, /restore/i]) {
      expect(el.textContent).not.toMatch(paid);
    }
  });

  it('Continue records the choice, ends the first-run offer and goes where the user was headed', async () => {
    const { root, storage, continueFree } = await render({ next: '/you' });
    await continueFree();
    expect(root).toHaveBeenCalledWith('/you');
    expect(await TestBed.inject(FirstRunOfferService).isPending()).toBe(false);
    expect(JSON.parse(storage.values.get('stokeform.plan-choice')!)).toMatchObject({ choice: 'free', accountId: null });
  });

  it('an outside link in `next` goes Home instead', async () => {
    const { root, continueFree } = await render({ next: 'https://example.test/phish' });
    await continueFree();
    expect(root).toHaveBeenCalledWith('/home');
  });
});

describe('OfferPage: "Build my own" chosen during setup', () => {
  it('with Pro not sold (the live app), Continue goes straight to the custom plan editor and the choice is used up', async () => {
    await freeLaunch(async () => {
      const { root, storage, continueFree } = await render({ buildOwn: true, next: '/home' });
      await continueFree();
      expect(root).toHaveBeenCalledWith('/workout/plan/edit');
      expect(storage.values.has('stokeform.plan-intent')).toBe(false);
    });
  });

  it('with Pro sold, a Pro user goes to the editor; a Free user to the Train tab, keeping the choice', async () => {
    const pro = await render({ billing: PREMIUM_TEST_BILLING, buildOwn: true });
    await pro.continueFree();
    expect(pro.root).toHaveBeenCalledWith('/workout/plan/edit');

    TestBed.resetTestingModule();
    const free = await render({ buildOwn: true, next: '/home' });
    await free.continueFree();
    expect(free.root).toHaveBeenCalledWith('/workout');
    expect(TestBed.inject(PlanIntentService).intent()).toBe('custom');
  });

  it('without that choice, nothing changes: Continue goes where the user was headed', async () => {
    const { root, continueFree } = await render({ next: '/home' });
    await continueFree();
    expect(root).toHaveBeenCalledWith('/home');
  });
});
