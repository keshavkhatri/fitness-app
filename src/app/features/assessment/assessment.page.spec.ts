import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { FITNESS_CALCULATION_CONFIG } from '../../core/calculations/calculation-config.token';
import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import { OnboardingStatusService } from '../../core/profile/onboarding-status.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { DEFAULT_CALCULATION_CONFIG, FitnessCalculationConfig } from '../../domain/fitness-calculations';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { AssessmentPage } from './assessment.page';
import { AssessmentService } from './assessment.service';
import {
  CONSTRAINED_MACROS_CONFIG,
  FLOOR_APPLIED_PROFILE,
  INFEASIBLE_MACROS_CONFIG,
  NORMAL_PROFILE,
  REVIEW_REQUIRED_PROFILE,
  TODAY,
  profileWith,
} from './testing/assessment-fixtures';

interface SetupOptions {
  view?: string;
  profile?: UserFitnessProfile | null;
  config?: FitnessCalculationConfig;
  profileServiceFails?: boolean;
}

async function render({ view, profile = NORMAL_PROFILE, config = DEFAULT_CALCULATION_CONFIG, profileServiceFails }: SetupOptions = {}) {
  const storage = new MemoryKeyValueStorage();
  if (profile) {
    storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile }));
  }
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      AssessmentService,
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => TODAY },
      { provide: FITNESS_CALCULATION_CONFIG, useValue: config },
    ],
  });
  if (profileServiceFails) {
    vi.spyOn(TestBed.inject(FitnessProfileService), 'load').mockRejectedValueOnce(new Error('disk on fire'));
  }
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

  const fixture = TestBed.createComponent(AssessmentPage);
  if (view) {
    fixture.componentRef.setInput('view', view);
  }
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  const text = (testId: string) => el.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim();
  const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('ion-footer button')];
  const button = (label: string) => buttons().find((b) => b.textContent?.trim() === label);
  const click = async (label: string) => {
    button(label)!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const show = async (next: string) => {
    fixture.componentRef.setInput('view', next);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  return { fixture, el, text, buttons, button, click, navigate, storage, show };
}

describe('AssessmentPage', () => {
  describe('results view', () => {
    it('shows confidence, the calorie target, macros, goal and the profile it is based on', async () => {
      const { el, text } = await render();

      expect(el.querySelector('h1')?.textContent).toBe('Your assessment results');
      expect(text('confidence-chip')).toBe('Estimate confidence: Moderate confidence');
      expect(text('calorie-target')).toContain('2,306');
      expect(text('maintenance-caption')).toBe('Maintenance 2,713 kcal');
      expect(text('macro-grams')).toBe('Protein 144 g of calories: 25% Carbohydrates 259 g of calories: 45% Fat 77 g of calories: 30%');
      expect(text('goal-label')).toBe('Lose fat');
      expect(text('goal-target')).toContain('Lose 6 kg');
      expect([text('fact-weight'), text('fact-height'), text('fact-activity')]).toEqual(['80 kg', '180 cm', 'Moderately active']);
    });

    it('is dark (immersive), with no Back (it is where the assessment starts)', async () => {
      const { fixture, el } = await render();
      expect((fixture.nativeElement as HTMLElement).classList).toContain('fit-theme-immersive');
      expect(el.querySelector('button.back')).toBeNull();
    });

    it('hides target information when none applies', async () => {
      const { text } = await render({ profile: profileWith({ primaryGoal: 'get-stronger', goalTarget: { targetWeight: null } }) });
      expect(text('goal-label')).toBe('Build strength');
      expect(text('goal-target')).toBeUndefined();
    });

    it('the starting target has a spoken unit', async () => {
      const { el } = await render();
      expect(el.querySelector('[data-testid="calorie-target"] .visually-hidden')?.textContent).toBe('kilocalories per day');
    });
  });

  describe('moving through the views', () => {
    it('Results → Macro breakdown → Why these numbers? → Next steps, each as a ?view= link', async () => {
      const { buttons, click, navigate, show } = await render();
      expect(buttons().map((b) => b.textContent?.trim())).toEqual(['View macro breakdown']);
      await click('View macro breakdown');
      expect(navigate).toHaveBeenLastCalledWith('/assessment?view=macros');

      await show('macros');
      await click('Why these numbers?');
      expect(navigate).toHaveBeenLastCalledWith('/assessment?view=why');

      await show('why');
      await click('See your next steps');
      expect(navigate).toHaveBeenLastCalledWith('/assessment?view=next');
    });

    it('macro breakdown (light): a donut from the real grams, described in words, with every value listed', async () => {
      const { fixture, el, text } = await render({ view: 'macros' });
      expect((fixture.nativeElement as HTMLElement).classList).toContain('fit-theme-dashboard');
      expect(el.querySelector('h1')?.textContent).toBe('Your macro targets');
      expect(el.querySelector('[data-testid="macro-chart"] svg')?.getAttribute('aria-label')).toBe(
        '2,306 kilocalories a day: Protein 25% (144 g), Carbohydrates 45% (259 g), Fat 30% (77 g)',
      );
      expect(el.querySelectorAll('.slice')).toHaveLength(3);
      expect(text('macro-rows')).toContain('Protein 144 g 25% of calories (576 kcal)');
      expect(text('macro-rows')).toContain('Fat 77 g 30% of calories (693 kcal)');
    });

    it('why these numbers (dark): the engine’s steps, the target emphasised, confidence and collapsible factors', async () => {
      const { fixture, el, text } = await render({ view: 'why' });
      expect((fixture.nativeElement as HTMLElement).classList).toContain('fit-theme-immersive');
      expect(text('calculation-steps')).toContain('Resting energy (BMR)');
      expect(text('calculation-steps')).toContain('1.55×');
      expect(el.querySelector('[data-step="target"]')?.textContent).toContain('2,306 kcal');
      expect(text('confidence-label')).toBe('Moderate');

      const toggle = el.querySelector<HTMLButtonElement>('.factors-toggle')!;
      const factors = el.querySelector<HTMLElement>('[data-testid="factors"]')!;
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(factors.hidden).toBe(true);
      toggle.click();
      fixture.detectChanges();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(factors.hidden).toBe(false);
      expect(factors.textContent).toContain('Moderately active');
    });

    it('Back goes to the previous view (straight to it when opened directly)', async () => {
      const { el, navigate, fixture } = await render({ view: 'why' });
      el.querySelector<HTMLButtonElement>('button.back')!.click();
      await fixture.whenStable();
      expect(navigate).toHaveBeenCalledWith('/assessment?view=macros', { replaceUrl: true });
    });

    it('an unknown view shows the results', async () => {
      const { el } = await render({ view: 'nope' });
      expect(el.querySelector('h1')?.textContent).toBe('Your assessment results');
    });
  });

  describe('next steps', () => {
    it('Go to Home marks the assessment reviewed and goes Home; View again returns to the results', async () => {
      const { buttons, click, navigate } = await render({ view: 'next' });
      expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Go to Home', 'View assessment again']);

      await click('View assessment again');
      expect(navigate).toHaveBeenLastCalledWith('/assessment', { replaceUrl: true });

      await click('Go to Home');
      expect(navigate).toHaveBeenLastCalledWith('/home', { replaceUrl: true });
      expect(await TestBed.inject(OnboardingStatusService).status()).toBe('complete');
    });

    it.each([
      ['workout', '/workout'],
      ['nutrition', '/nutrition'],
      ['progress', '/progress'],
    ])('the %s card opens %s (and counts the assessment as reviewed)', async (id, path) => {
      const { el, navigate, fixture } = await render({ view: 'next' });
      el.querySelector<HTMLButtonElement>(`[data-testid="next-${id}"]`)!.click();
      await fixture.whenStable();
      expect(navigate).toHaveBeenLastCalledWith(path, { replaceUrl: true });
      expect(await TestBed.inject(OnboardingStatusService).status()).toBe('complete');
    });

    it('Adjust anytime opens the Profile editor', async () => {
      const { el, navigate, fixture } = await render({ view: 'next' });
      el.querySelector<HTMLButtonElement>('[data-testid="next-adjust"]')!.click();
      await fixture.whenStable();
      expect(navigate).toHaveBeenLastCalledWith('/onboarding/review');
    });
  });

  describe('confidence', () => {
    it('moderate', async () => {
      const { text, el } = await render({ view: 'why' });
      expect(text('confidence-label')).toBe('Moderate');
      expect(el.textContent).toContain('formula-based estimates');
    });

    it('low, with stronger uncertainty copy, never "high"', async () => {
      const { text, el } = await render({ view: 'why', profile: profileWith({ sex: 'prefer-not-to-say' }) });
      expect(text('confidence-label')).toBe('Low');
      expect(el.textContent).toContain('less precise');
      expect(el.textContent).not.toMatch(/high confidence/i);
    });
  });

  describe('calorie target status', () => {
    it('floor-applied: target shown with an explanatory notice', async () => {
      const { text, el } = await render({ profile: FLOOR_APPLIED_PROFILE });
      expect(text('calorie-target')).toContain('1,200');
      expect(el.textContent).toContain('A steadier starting target');
    });

    it('review-required: target not presented, review is the primary action', async () => {
      const { el, text, buttons, click, navigate } = await render({ profile: REVIEW_REQUIRED_PROFILE });

      expect(el.querySelector('[data-testid="calorie-target"]')).toBeNull();
      expect(text('calorie-review')).toContain('Your numbers need a second look');
      expect(el.querySelector('[data-testid="macro-grams"]')).toBeNull();
      expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Review my details', 'Continue for now']);

      await click('Review my details');
      expect(navigate).toHaveBeenCalledWith('/onboarding/review');
    });
  });

  describe('macro status', () => {
    it('constrained: grams with attention messaging; Continue still available', async () => {
      const { text, buttons } = await render({ config: CONSTRAINED_MACROS_CONFIG });
      expect(text('macro-notice')).toContain('Macro balance needs review');
      expect(text('macro-grams')).toMatch(/\d+ g/);
      expect(buttons()[0].textContent?.trim()).toBe('View macro breakdown');
    });

    it('infeasible: no gram targets rendered, review first', async () => {
      const { el, text, buttons } = await render({ config: INFEASIBLE_MACROS_CONFIG });
      expect(el.querySelector('[data-testid="macro-grams"]')).toBeNull();
      expect(text('macros-unavailable')).toContain("We couldn't create a balanced macro target");
      expect(buttons()[0].textContent?.trim()).toBe('Review my details');
    });
  });

  describe('error states', () => {
    it('missing profile: incomplete message with a route back', async () => {
      const { text, buttons, click, navigate } = await render({ profile: null });
      expect(text('incomplete')).toContain('Your fitness profile is incomplete. Please review your details.');
      expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Review my details']);
      await click('Review my details');
      expect(navigate).toHaveBeenCalledWith('/onboarding/review');
    });

    it('calculation rejected by the engine: handled as incomplete', async () => {
      // A profile the engine refuses (e.g. under 18 on the current date) never reaches the template.
      const { text, el } = await render({ profile: profileWith({ dateOfBirth: '2020-01-01' }) });
      expect(text('incomplete')).toBeTruthy();
      expect(el.querySelector('[data-testid="calorie-target"]')).toBeNull();
    });

    it('unexpected failure: friendly error and a working retry', async () => {
      const { text, el, click, fixture } = await render({ profileServiceFails: true });
      expect(text('error')).toContain("We couldn't load your starting point");
      expect(el.textContent).not.toContain('disk on fire');

      await click('Try again');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="calorie-target"]')).not.toBeNull();
    });
  });

  describe('accessibility', () => {
    it('every action is a labelled native button', async () => {
      const { buttons } = await render({ profile: REVIEW_REQUIRED_PROFILE });
      for (const b of buttons()) {
        expect(b.tagName).toBe('BUTTON');
        expect(b.textContent?.trim().length).toBeGreaterThan(0);
      }
    });

    it('review notices carry a visible title, not just color', async () => {
      const { el } = await render({ profile: REVIEW_REQUIRED_PROFILE });
      const notice = el.querySelector('[data-testid="calorie-review"]');
      expect(notice?.querySelector('h3')?.textContent).toBe('Your numbers need a second look');
      expect(notice?.querySelector('ion-icon')?.getAttribute('aria-hidden')).toBe('true');
    });

  });
});
