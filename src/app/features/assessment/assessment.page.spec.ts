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
  profile?: UserFitnessProfile | null;
  config?: FitnessCalculationConfig;
  profileServiceFails?: boolean;
}

async function render({ profile = NORMAL_PROFILE, config = DEFAULT_CALCULATION_CONFIG, profileServiceFails }: SetupOptions = {}) {
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

  return { fixture, el, text, buttons, button, click, navigate, storage };
}

describe('AssessmentPage', () => {
  describe('normal result', () => {
    it('shows the heading, goal, estimates, starting target and macros', async () => {
      const { el, text } = await render();

      expect(el.querySelector('h1')?.textContent).toBe('Your starting point');
      expect(text('goal-label')).toBe('Lose fat');
      expect(text('goal-target')).toContain('Lose 6 kg');
      expect(text('calorie-target')).toContain('2,306');
      expect(text('bmr')).toBe('1,750 kcal');
      expect(text('maintenance')).toBe('2,713 kcal');
      expect(text('macro-grams')).toContain('144 g');
      expect(text('macro-grams')).toContain('77 g');
      expect(text('macro-grams')).toContain('259 g');
      expect(el.textContent).toContain('Estimated BMR');
      expect(el.textContent).toContain('Estimated maintenance');
    });

    it('uses a meaningful heading outline', async () => {
      const { el } = await render();
      expect(el.querySelectorAll('h1').length).toBe(1);
      const h2s = [...el.querySelectorAll('h2')].map((h) => h.textContent?.trim());
      expect(h2s).toEqual(['Your goal', 'Daily energy', 'Daily macro targets', 'Why these numbers?', 'Estimate confidence']);
    });

    it('Continue marks the assessment reviewed and goes Home', async () => {
      const { buttons, click, navigate } = await render();
      expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Continue']);

      await click('Continue');

      expect(navigate).toHaveBeenCalledWith('/home', { replaceUrl: true });
      expect(await TestBed.inject(OnboardingStatusService).status()).toBe('complete');
    });

    it('hides target information when none applies', async () => {
      const { text } = await render({ profile: profileWith({ primaryGoal: 'get-stronger', goalTarget: { targetWeight: null } }) });
      expect(text('goal-label')).toBe('Build strength');
      expect(text('goal-target')).toBeUndefined();
    });
  });

  describe('confidence', () => {
    it('moderate', async () => {
      const { text, el } = await render();
      expect(text('confidence-label')).toBe('Moderate');
      expect(el.textContent).toContain('formula-based estimates');
    });

    it('low, with stronger uncertainty copy', async () => {
      const { text, el } = await render({ profile: profileWith({ sex: 'prefer-not-to-say' }) });
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
      expect(buttons()[0].textContent?.trim()).toBe('Continue');
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

    it('the starting target has a spoken unit', async () => {
      const { el } = await render();
      expect(el.querySelector('[data-testid="calorie-target"] .visually-hidden')?.textContent).toBe('kilocalories per day');
    });
  });
});
