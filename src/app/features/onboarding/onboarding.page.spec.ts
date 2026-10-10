import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { NORMAL_PROFILE, TODAY } from '../assessment/testing/assessment-fixtures';
import { OnboardingPage } from './onboarding.page';
import { OnboardingFlow } from './state/onboarding-flow.service';

/** The profile review (/onboarding/review), opened with an optional `returnTo`. */
async function renderReview(returnTo?: string) {
  const storage = new MemoryKeyValueStorage();
  storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile: NORMAL_PROFILE }));
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      OnboardingFlow,
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => TODAY },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(OnboardingPage);
  fixture.componentRef.setInput('mode', 'review');
  fixture.componentRef.setInput('returnTo', returnTo);
  fixture.detectChanges();
  const flow = fixture.debugElement.injector.get(OnboardingFlow);
  // The page loads the stored profile, then opens its summary.
  await vi.waitFor(() => expect(flow.mode()).toBe('review'));
  fixture.detectChanges();
  const back = async () => {
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.back')!.click();
    await fixture.whenStable();
  };
  return { fixture, navigate, back, flow };
}

describe('OnboardingPage (profile review)', () => {
  it('opens the existing profile at its summary', async () => {
    const { flow, navigate } = await renderReview();
    expect(navigate).not.toHaveBeenCalled();
    expect(flow.mode()).toBe('review');
    expect(flow.stepId()).toBe('summary');
  });

  it('backing out unchanged returns to the assessment by default', async () => {
    const { navigate, back } = await renderReview();
    await back();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/assessment', { replaceUrl: true });
  });

  it('backing out unchanged returns to an allowed returnTo (You)', async () => {
    const { navigate, back } = await renderReview('/you');
    await back();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/you', { replaceUrl: true });
  });

  it('ignores a returnTo that is not an allowed screen', async () => {
    const { navigate, back } = await renderReview('https://example.com');
    await back();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/assessment', { replaceUrl: true });
  });
});
