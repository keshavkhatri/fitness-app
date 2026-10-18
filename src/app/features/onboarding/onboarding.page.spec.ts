import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { ThemeService } from '../../core/theme/theme.service';
import { WorkoutPlanService } from '../../core/workout/workout-plan.service';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { NORMAL_PROFILE, TODAY } from '../assessment/testing/assessment-fixtures';
import { OnboardingPage } from './onboarding.page';
import { OnboardingFlow } from './state/onboarding-flow.service';
import { completeDraft } from './testing/draft-fixtures';

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

  it('is the Profile editor: dark, grouped rows that open their step, and Save profile', async () => {
    const { fixture, flow } = await renderReview('/you');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.classList).toContain('fit-theme-immersive');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Profile');
    expect([...el.querySelectorAll('.group-title')].map((h) => h.textContent?.trim())).toEqual(['Personal details', 'Goal', 'Training']);
    expect(el.querySelector('ion-footer button')?.textContent?.trim()).toBe('Save profile');
    const height = el.querySelector<HTMLButtonElement>('[data-testid=profile-row-height]')!;
    expect(height.getAttribute('aria-label')).toMatch(/^Edit height: /);
    height.click();
    expect(flow.stepId()).toBe('height');
    expect(flow.editingFromSummary()).toBe(true);
  });

  it('first run: a dark welcome, then the light (lime) questions', async () => {
    TestBed.configureTestingModule({ providers: [provideIonicAngular(), provideRouter([]), OnboardingFlow, { provide: KeyValueStorage, useValue: new MemoryKeyValueStorage() }] });
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.detectChanges();
    const flow = fixture.debugElement.injector.get(OnboardingFlow);
    await vi.waitFor(() => expect(flow.ready()).toBe(true));
    fixture.detectChanges();
    const host = (fixture.nativeElement as HTMLElement).classList;
    expect(host).toContain('fit-theme-immersive');
    expect(host).not.toContain('fit-theme-dashboard');

    flow.next();
    fixture.detectChanges();
    expect(host).not.toContain('fit-theme-immersive');
    expect(host).toContain('fit-theme-dashboard');
  });
});

describe('OnboardingPage (first run)', () => {
  async function renderAt(stepId: string, draft = completeDraft()) {
    const storage = new MemoryKeyValueStorage();
    storage.values.set('fitness.onboarding-progress', JSON.stringify({ version: 3, stepId, draft, editingFromSummary: false }));
    TestBed.configureTestingModule({
      providers: [provideIonicAngular(), provideRouter([]), OnboardingFlow, { provide: KeyValueStorage, useValue: storage }],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.detectChanges();
    const flow = fixture.debugElement.injector.get(OnboardingFlow);
    await vi.waitFor(() => expect(flow.ready()).toBe(true));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const primary = () => el.querySelector<HTMLButtonElement>('ion-footer button')!;
    return { fixture, flow, el, primary, navigate, storage };
  }

  /** Presses Android's hardware Back: Ionic hands every registered handler to the one with the top priority. */
  function pressHardwareBack() {
    const handlers: [number, (next: () => void) => void][] = [];
    const next = vi.fn();
    document.dispatchEvent(new CustomEvent('ionBackButton', { detail: { register: (priority: number, handler: (next: () => void) => void) => handlers.push([priority, handler]) } }));
    handlers.sort((x, y) => y[0] - x[0])[0]?.[1](next);
    return next;
  }

  it('hardware Back on the account step goes back to the review', async () => {
    const { flow } = await renderAt('account');
    const next = pressHardwareBack();
    await vi.waitFor(() => expect(flow.stepId()).toBe('summary'));
    expect(next).not.toHaveBeenCalled();
  });

  it("hardware Back is left to the sign-in screen on top: the hidden questionnaire doesn't step back", async () => {
    const { fixture, flow } = await renderAt('account');
    (fixture.nativeElement as HTMLElement).classList.add('ion-page-hidden');
    const next = pressHardwareBack();
    await new Promise((r) => setTimeout(r, 50));
    expect(next).toHaveBeenCalledOnce();
    expect(flow.stepId()).toBe('account');
  });

  it('the dark welcome step gets light status-bar text; the light questions do not', async () => {
    const { fixture, flow } = await renderAt('welcome');
    const theme = TestBed.inject(ThemeService);
    theme.setPreference('light');
    fixture.detectChanges();
    expect(theme.statusBarTheme()).toBe('dark');

    flow.next();
    fixture.detectChanges();
    expect(flow.stepId()).not.toBe('welcome');
    expect(theme.statusBarTheme()).toBe('light');
  });

  it('the summary continues to the account step: nothing is saved and no results are shown yet', async () => {
    const { fixture, flow, primary, navigate, storage } = await renderAt('summary');
    const save = vi.spyOn(TestBed.inject(FitnessProfileService), 'save');
    expect(primary().textContent?.trim()).toBe('Continue');

    primary().click();
    primary().click();
    await vi.waitFor(() => expect(flow.stepId()).toBe('account'));
    await fixture.whenStable();

    expect(save).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(JSON.parse(storage.values.get('fitness.onboarding-progress')!).stepId).toBe('account');
  });

  it('the finish screen says the workout plan is ready only once it was made', async () => {
    const { fixture, flow, el } = await renderAt('summary');
    await flow.complete();
    fixture.detectChanges();
    expect(el.querySelector('app-finish-step')?.textContent).toContain('Building your workout plan');

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('app-finish-step .text')?.textContent).toBe('Your profile is saved and your workout plan is ready.');
    });
    expect(el.querySelector('app-finish-step')?.textContent).toContain('4 days a week');
  });

  it('says so, without claiming a plan, when none could be made', async () => {
    const { fixture, flow, el } = await renderAt('summary');
    vi.spyOn(TestBed.inject(WorkoutPlanService), 'load').mockResolvedValue({ kind: 'no-profile' });
    await flow.complete();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('app-finish-step .text')?.textContent).toBe('Your profile is saved.');
    });
    expect(el.querySelector('app-finish-step')?.textContent).not.toContain('plan is ready');
    expect(el.querySelector('app-finish-step')?.textContent).toContain("Couldn't be made from these answers yet");
  });

  it('shows real progress, and the height ruler restores the saved height on Back', async () => {
    const { fixture, flow, el } = await renderAt('weight', completeDraft({ basics: { ...completeDraft().basics, height: { centimeters: 181.5 } } }));
    expect(el.querySelector('.count')?.textContent?.trim()).toBe('3/11');
    el.querySelector<HTMLButtonElement>('button.back')!.click();
    fixture.detectChanges();
    expect(flow.stepId()).toBe('height');
    // An off-tick value (e.g. from a report) is shown exactly, not snapped.
    expect(el.querySelector('fit-ruler')?.getAttribute('aria-valuenow')).toBe('181.5');
  });
});
