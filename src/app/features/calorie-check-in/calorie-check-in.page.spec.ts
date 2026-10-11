import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { CalorieCheckInService } from '../../core/calorie-check-in/calorie-check-in.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { WeightEntry } from '../../domain/body-measurements';
import { calculateFitnessAssessment } from '../../domain/fitness-calculations';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { FoodEntry, createFoodEntry } from '../../domain/nutrition';
import { NutritionPage } from '../nutrition/nutrition.page';
import { CalorieCheckInPage } from './calorie-check-in.page';

// Synthetic data only. "Now" is Thursday 29 October 2026, 09:00 local; the period is 1–28 October.
const NOW = new Date(2026, 9, 29, 9, 0);
const PROFILE: UserFitnessProfile = {
  primaryGoal: 'lose-fat',
  dateOfBirth: '1990-06-15',
  sex: 'male',
  height: { centimeters: 180 },
  weight: { kilograms: 84 },
  unitSystem: 'metric',
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  trainingLocation: 'gym',
  equipment: ['full-gym'],
  activityLevel: 'moderately-active',
  goalTarget: { targetWeight: null },
  updatedAt: '2026-09-01T09:00:00.000Z',
};
const FORMULA = (() => {
  const r = calculateFitnessAssessment(PROFILE, { asOfDate: '2026-10-29' });
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
})();
const KEYS = { profile: 'fitness.profile', food: 'fitness.nutrition-entries', weights: 'fitness.body-weight-entries', reviewed: 'fitness.assessment-reviewed' };
const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);

const date = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10);
let seq = 0;
const food = (d: string, calories: number): FoodEntry => {
  const r = createFoodEntry({ name: 'Meal', quantity: 1, unit: 'serving', meal: 'lunch', calories, proteinGrams: 30, carbohydrateGrams: 50, fatGrams: 20 }, { id: `f${++seq}`, date: d, now: `${d}T12:00:00.000Z` });
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
};
const weigh = (d: string, kilograms: number): WeightEntry => ({ id: `w-${d}`, date: d, weight: { kilograms }, createdAt: `${d}T07:00:00.000Z`, updatedAt: `${d}T07:00:00.000Z` });
/** Observed maintenance 600 kcal below the formula's (−0.5 kg/week on tdee − 1,150 kcal): a capped proposal. */
const INTAKE = FORMULA.estimates.tdeeKcal - 1150;
const FOODS = Array.from({ length: 28 }, (_, n) => food(date(n), INTAKE));
const WEIGHTS = Array.from({ length: 14 }, (_, i) => weigh(date(i * 2), Math.round((84 - (0.5 / 7) * i * 2) * 100) / 100));

function configure(options: { profile?: UserFitnessProfile | null; foods?: FoodEntry[]; weights?: WeightEntry[] } = {}) {
  const storage = new MemoryKeyValueStorage();
  const profile = options.profile === undefined ? PROFILE : options.profile;
  if (profile) {
    storage.values.set(KEYS.profile, JSON.stringify({ version: 2, profile }));
    storage.values.set(KEYS.reviewed, JSON.stringify({ version: 1, profileUpdatedAt: profile.updatedAt }));
  }
  storage.values.set(KEYS.food, JSON.stringify({ version: 1, entries: options.foods ?? FOODS }));
  storage.values.set(KEYS.weights, JSON.stringify({ version: 1, entries: options.weights ?? WEIGHTS }));
  TestBed.configureTestingModule({
    providers: [provideIonicAngular(), provideRouter([]), { provide: KeyValueStorage, useValue: storage }, { provide: CLOCK, useValue: () => NOW }],
  });
  const nav = TestBed.inject(NavController);
  return { storage, forward: vi.spyOn(nav, 'navigateForward').mockResolvedValue(true) };
}

async function settle(fixture: ComponentFixture<unknown>) {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const byTestId = (el: ParentNode, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const sheet = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function render(options: Parameters<typeof configure>[0] & { before?: () => void } = {}) {
  const spies = configure(options);
  options.before?.();
  const fixture = TestBed.createComponent(CalorieCheckInPage);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const tap = async (target: HTMLElement | null) => {
    target!.click();
    await settle(fixture);
  };
  return { ...spies, fixture, el, tap, page: fixture.componentInstance as unknown as { acceptOpen(): boolean; formulaOpen(): boolean } };
}

const savedProfile = (storage: MemoryKeyValueStorage) => JSON.parse(storage.values.get(KEYS.profile)!).profile as UserFitnessProfile;

describe('Calorie Check-in page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('ion-modal').forEach((m) => m.remove());
  });

  it('separates what was recorded, the estimated maintenance and the proposed target', async () => {
    const { el } = await render();
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Calorie check-in');
    expect(clean(byTestId(el, 'period'))).toBe('Oct 1 – 28, 2026 · last 4 weeks');
    expect(clean(byTestId(el, 'observed-intake'))).toBe(`Average logged intake ${fmt(INTAKE)} kcal a day Food logged on 28 of 28 days; days without entries aren’t counted`);
    expect(clean(byTestId(el, 'observed-weight'))).toBe('Weight trend −0.5 kg a week 14 weigh-ins: 84.0 kg on Oct 1 → 82.1 kg on Oct 27');
    expect(clean(byTestId(el, 'observed-target'))).toBe(`Current calorie target ${fmt(FORMULA.targets.calories.finalKcal)} kcal a day`);

    // Rounded to 10 kcal; the fixture's −0.5 kg/week trend implies ≈ 550 kcal a day.
    const shown = clean(byTestId(el, 'estimate-value')).match(/^Estimated maintenance calories: ([\d,]+) kcal a day$/);
    const estimate = Number(shown![1].replace(',', ''));
    expect(Math.abs(estimate - (INTAKE + 550))).toBeLessThanOrEqual(10);
    expect(clean(byTestId(el, 'estimate-range'))).toBe(`Likely between ${fmt(estimate - 150)} and ${fmt(estimate + 150)} kcal`);
    expect(clean(byTestId(el, 'estimate-how'))).toContain('suggests a deficit of about 550 kcal a day, using about 7,700 kcal per kg');
    expect(clean(byTestId(el, 'estimate'))).toContain('An estimate, not a measurement.');

    expect(clean(byTestId(el, 'trend-note'))).toBe('Your weight is trending down, in line with your fat-loss goal.');
    expect(clean(byTestId(el, 'proposal'))).toMatch(/^Lower your target to [\d,]+ kcal a day \(−[\d,]+ kcal\)\.$/);
    expect(clean(byTestId(el, 'recommendation'))).toContain('limited to 250 kcal of maintenance per check-in');
    expect(clean(byTestId(el, 'target-source'))).toBe(`Based on the estimated maintenance of ${fmt(FORMULA.estimates.tdeeKcal)} kcal a day calculated from your profile.`);
    expect(byTestId(el, 'use-formula')).toBeNull();
  });

  it('keeping the current target changes nothing', async () => {
    const { el, tap, storage } = await render();
    const before = new Map(storage.values);
    await tap(byTestId(el, 'keep-target'));
    expect(clean(byTestId(el, 'kept'))).toBe('Kept your current target. Nothing was changed.');
    expect(byTestId(el, 'review-change')).toBeNull();
    expect(clean(byTestId(el, 'announcement'))).toBe('Kept your current target. Nothing was changed.');
    expect(new Map(storage.values)).toEqual(before);
  });

  it('nothing is saved until the change is confirmed; cancelling saves nothing', async () => {
    const { el, tap, storage, page } = await render();
    const before = storage.values.get(KEYS.profile);
    await tap(byTestId(el, 'review-change'));
    expect(page.acceptOpen()).toBe(true);
    const s = sheet('confirm-sheet')!;
    expect(clean(byTestId(s, 'confirm-current'))).toBe(`${fmt(FORMULA.targets.calories.finalKcal)} kcal a day`);
    expect(clean(byTestId(s, 'confirm-macros'))).toMatch(/^Protein \d+ g · Carbohydrates \d+ g · Fat \d+ g$/);
    expect(clean(s)).toContain('workout plan aren’t changed');
    expect(storage.values.get(KEYS.profile)).toBe(before);
    await tap([...s.querySelectorAll('button')].find((b) => clean(b) === 'Cancel')!);
    expect(page.acceptOpen()).toBe(false);
    expect(storage.values.get(KEYS.profile)).toBe(before);
  });

  it('confirming saves the new target through the profile and shows the result', async () => {
    const { el, tap, storage, page } = await render();
    const next = clean(byTestId(el, 'proposal')).match(/to ([\d,]+) kcal/)![1];
    await tap(byTestId(el, 'review-change'));
    expect(clean(byTestId(sheet('confirm-sheet')!, 'confirm-next'))).toBe(`${next} kcal a day`);
    await tap(byTestId(sheet('confirm-sheet')!, 'confirm-change'));
    expect(page.acceptOpen()).toBe(false);
    expect(savedProfile(storage).energyCalibration).toMatchObject({ maintenanceKcal: FORMULA.estimates.tdeeKcal - 250, observedFrom: '2026-10-01', observedTo: '2026-10-28' });
    expect(clean(byTestId(el, 'outcome'))).toBe(`Your calorie target is now ${next} kcal a day.`);
    expect(clean(byTestId(el, 'observed-target'))).toContain(`${next} kcal a day`);
    expect(clean(byTestId(el, 'recommendation-message'))).toMatch(/you changed it recently.*from Nov 12\.$/);
    expect(clean(byTestId(el, 'target-source'))).toBe(`Based on maintenance of ${fmt(FORMULA.estimates.tdeeKcal - 250)} kcal a day from your check-in on Oct 29.`);
    expect(byTestId(el, 'use-formula')).not.toBeNull();
  });

  it('a failed save keeps the sheet open with the reason; nothing changes', async () => {
    const { el, tap, storage, page } = await render();
    const before = storage.values.get(KEYS.profile);
    await tap(byTestId(el, 'review-change'));
    storage.failWrites = true;
    await tap(byTestId(sheet('confirm-sheet')!, 'confirm-change'));
    expect(page.acceptOpen()).toBe(true);
    expect(clean(byTestId(sheet('confirm-sheet')!, 'confirm-status'))).toBe('Couldn’t save the change. Nothing was changed; try again.');
    expect(storage.values.get(KEYS.profile)).toBe(before);
  });

  it('if the data changed after the proposal was shown, nothing is saved and the check-in refreshes', async () => {
    const { el, tap, storage } = await render();
    const before = storage.values.get(KEYS.profile);
    await tap(byTestId(el, 'review-change'));
    storage.values.set(KEYS.food, JSON.stringify({ version: 1, entries: Array.from({ length: 28 }, (_, n) => food(date(n), FORMULA.estimates.tdeeKcal - 550)) }));
    await tap(byTestId(sheet('confirm-sheet')!, 'confirm-change'));
    expect(storage.values.get(KEYS.profile)).toBe(before);
    expect(clean(byTestId(el, 'outcome'))).toBe('Your data changed since this was shown, so nothing was saved. Here is the updated check-in.');
    expect(clean(byTestId(el, 'recommendation-message'))).toMatch(/^Keep your current target: it’s built on a maintenance figure inside your estimated range\.$/);
  });

  it('returning to the calculated target also needs confirmation', async () => {
    const energyCalibration = { maintenanceKcal: 2500, observedFrom: '2026-09-01', observedTo: '2026-09-28', acceptedAt: '2026-09-29T09:00:00.000Z' };
    const { el, tap, storage, page } = await render({ profile: { ...PROFILE, energyCalibration } });
    expect(clean(byTestId(el, 'target-source'))).toBe('Based on maintenance of 2,500 kcal a day from your check-in on Sep 29.');
    await tap(byTestId(el, 'use-formula'));
    expect(page.formulaOpen()).toBe(true);
    expect(savedProfile(storage).energyCalibration).toEqual(energyCalibration);
    await tap(byTestId(sheet('formula-sheet')!, 'confirm-formula'));
    expect('energyCalibration' in savedProfile(storage)).toBe(false);
    expect(clean(byTestId(el, 'outcome'))).toBe('Your calorie target is calculated from your profile again.');
    expect(byTestId(el, 'use-formula')).toBeNull();
  });

  it('insufficient data: says what is missing and links to logging; no estimate, no proposal', async () => {
    const { el, tap, forward } = await render({ foods: FOODS.slice(0, 6), weights: WEIGHTS.slice(0, 2) });
    expect(byTestId(el, 'estimate-value')).toBeNull();
    expect(clean(byTestId(el, 'missing-logged-days'))).toBe('Log food on at least 14 of the 28 days (6 so far). Log food');
    expect(clean(byTestId(el, 'missing-weigh-ins'))).toBe('Weigh in on at least 4 different days (2 so far). Log weight');
    expect(byTestId(el, 'review-change')).toBeNull();
    expect(clean(byTestId(el, 'recommendation-message'))).toBe('Keep your current target and keep logging. A suggestion needs the data listed above.');
    expect(byTestId(el, 'intake-vs-target')).toBeNull();
    await tap(byTestId(el, 'missing-weigh-ins')!.querySelector('button'));
    expect(forward).toHaveBeenCalledWith(['/you', 'weight-history', 'new']);
    await tap(byTestId(el, 'missing-logged-days')!.querySelector('button'));
    expect(forward).toHaveBeenLastCalledWith(['/nutrition', 'food', 'new'], { queryParams: { meal: 'breakfast', date: '2026-10-29' } });
  });

  it('without a profile: shows the estimate, explains there is no target, proposes nothing', async () => {
    const { el } = await render({ profile: null });
    expect(clean(byTestId(el, 'observed-target'))).toBe('Current calorie target Not available Set up your profile to get a calorie target.');
    expect(byTestId(el, 'estimate-value')).not.toBeNull();
    expect(clean(byTestId(el, 'recommendation-message'))).toBe('There’s no valid calorie target to compare with, so no change is suggested.');
    expect(byTestId(el, 'review-change')).toBeNull();
  });

  it('error: a calm message and retry; nothing changed', async () => {
    const { el, fixture } = await render({ before: () => vi.spyOn(TestBed.inject(CalorieCheckInService), 'load').mockRejectedValueOnce(new Error('storage')) });
    expect(clean(byTestId(el, 'check-in-error'))).toContain('We couldn’t load your check-in');
    expect(el.textContent).not.toContain('storage');
    [...el.querySelectorAll('button')].find((b) => clean(b) === 'Try again')!.click();
    await settle(fixture);
    expect(byTestId(el, 'check-in-error')).toBeNull();
    expect(byTestId(el, 'estimate-value')).not.toBeNull();
  });

  it('loading: busy skeletons and an announcement', () => {
    configure();
    vi.spyOn(TestBed.inject(CalorieCheckInService), 'load').mockReturnValue(new Promise(() => undefined));
    const fixture = TestBed.createComponent(CalorieCheckInPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(byTestId(el, 'check-in-loading')?.getAttribute('aria-busy')).toBe('true');
    expect(clean(byTestId(el, 'announcement'))).toBe('Loading your calorie check-in');
  });

  it('re-entering re-reads the data and never applies the proposal', async () => {
    const { fixture, storage } = await render();
    const before = storage.values.get(KEYS.profile);
    const load = vi.spyOn(TestBed.inject(CalorieCheckInService), 'load');
    const page = fixture.componentInstance;
    page.ionViewWillEnter();
    page.ionViewWillEnter();
    await settle(fixture);
    expect(load).toHaveBeenCalledTimes(1);
    expect(storage.values.get(KEYS.profile)).toBe(before);
  });

  it('accessibility: one h1, labelled sections, named buttons, dialog triggers marked', async () => {
    const { el } = await render();
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    for (const section of el.querySelectorAll('section[aria-labelledby]')) {
      expect(clean(el.querySelector(`#${section.getAttribute('aria-labelledby')}`))).not.toBe('');
    }
    for (const button of el.querySelectorAll('button')) {
      expect(button.getAttribute('aria-label') || clean(button)).not.toBe('');
    }
    expect(byTestId(el, 'review-change')?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(byTestId(el, 'announcement')?.getAttribute('role')).toBe('status');
  });
});

describe('Nutrition dashboard → Calorie check-in', () => {
  it('is reachable from the dashboard', async () => {
    const { forward } = configure();
    const fixture = TestBed.createComponent(NutritionPage);
    await settle(fixture);
    const button = byTestId(fixture.nativeElement, 'open-check-in') as HTMLButtonElement;
    expect(clean(button)).toBe('Calorie check-in');
    button.click();
    expect(forward).toHaveBeenCalledWith(['/nutrition', 'check-in']);
  });
});
