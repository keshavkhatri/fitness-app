import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { BILLING_PROVIDER } from '../../../core/entitlements/billing';
import { PREMIUM_TEST_BILLING } from '../../../core/entitlements/testing/premium-billing';
import { KeyValueStorage } from '../../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../../core/time/clock';
import { PROFILE, THURSDAY } from '../../workout/testing/workout-fixtures';
import { FinishStepComponent } from './finish-step.component';

async function render(premium: boolean) {
  const storage = new MemoryKeyValueStorage();
  storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile: PROFILE }));
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => THURSDAY },
      ...(premium ? [{ provide: BILLING_PROVIDER, useValue: PREMIUM_TEST_BILLING }] : []),
    ],
  });
  const forward = vi.spyOn(TestBed.inject(NavController), 'navigateForward').mockResolvedValue(true);
  const fixture = TestBed.createComponent(FinishStepComponent);
  await vi.waitFor(async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="plan-preview"]')).not.toBeNull();
  });
  const el = fixture.nativeElement as HTMLElement;
  return { el, storage, forward, q: (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`) };
}

describe('first-run plan presentation: generated plan or build my own', () => {
  it('keeps the generated plan as the default Free choice and the plan is made and saved as before', async () => {
    const { q, storage } = await render(false);
    expect(q('plan-preview')!.textContent).toMatch(/exercises · about \d+ min/);
    expect(q('choice-generated')!.textContent).toContain('Use generated plan');
    expect(q('choice-generated')!.textContent).toContain('Free');
    expect(JSON.parse(storage.values.get('fitness.workout-plan')!).plan.custom).toBeUndefined();
  });

  it('for Free users, "Build my own" is a Pro option explained in words: no button, no purchase claim', async () => {
    const { q, forward } = await render(false);
    expect(q('choice-build')).toBeNull();
    const note = q('choice-build-unavailable')!;
    expect(note.textContent).toContain('Build my own');
    expect(note.textContent).toContain('Pro');
    expect(note.textContent).toContain('Choose your own exercises and edit your plan with Pro.');
    expect(note.textContent).toContain('Your plan');
    expect(note.textContent).not.toContain('Premium');
    expect(note.tagName).not.toBe('BUTTON');
    expect(forward).not.toHaveBeenCalled();
  });

  it('with a verified Premium entitlement it opens the editor', async () => {
    const { q, forward, el } = await render(true);
    await vi.waitFor(() => expect(q('choice-build')).not.toBeNull());
    q('choice-build')!.click();
    expect(forward).toHaveBeenCalledWith('/workout/plan/edit');
    expect(el.querySelector('[data-testid="choice-generated"]')).not.toBeNull();
  });
});
