import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { CurrentAssessment, FitnessAssessmentService } from '../../core/calculations/fitness-assessment.service';
import { NutritionRepository } from '../../core/nutrition/nutrition.repository';
import { NutritionService } from '../../core/nutrition/nutrition.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { FoodEntry, FoodEntryInput, createFoodEntry } from '../../domain/nutrition';
import { ADDED_COOLDOWN_MS, AddFoodPage } from './add-food.page';
import { FoodEntryPage } from './food-entry.page';
import { NutritionPage } from './nutrition.page';

const KEY = 'fitness.nutrition-entries';
const NOW = new Date(2026, 9, 8, 12, 30);
const INPUT: FoodEntryInput = { name: 'Oats', quantity: 60, unit: 'g', meal: 'breakfast', calories: 230, proteinGrams: 8, carbohydrateGrams: 40, fatGrams: 4 };
const food = (id: string, date: string, overrides: Partial<FoodEntryInput> = {}): FoodEntry => {
  const r = createFoodEntry({ ...INPUT, ...overrides }, { id, date, now: `${date}T08:00:00.000Z` });
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
};

/** Only the fields the nutrition target mapping reads. */
const assessment = (calories: object, macros: object): CurrentAssessment =>
  ({ kind: 'ready', profile: {} as never, assessment: { targets: { calories, macros } } as never });
const NORMAL = assessment(
  { finalKcal: 2000, status: 'normal' },
  { status: 'feasible', proteinGrams: 140, carbohydrateGrams: 220, fatGrams: 65 },
);

function configure(entries: readonly FoodEntry[], targets: CurrentAssessment = NORMAL) {
  const storage = new MemoryKeyValueStorage();
  if (entries.length) {
    storage.values.set(KEY, JSON.stringify({ version: 1, entries }));
  }
  const current = vi.fn<() => Promise<CurrentAssessment>>().mockResolvedValue(targets);
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => NOW },
      { provide: FitnessAssessmentService, useValue: { current } },
    ],
  });
  const nav = TestBed.inject(NavController);
  return {
    storage,
    current,
    forward: vi.spyOn(nav, 'navigateForward').mockResolvedValue(true),
    back: vi.spyOn(nav, 'navigateBack').mockResolvedValue(true),
    navigateByUrl: vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true),
  };
}

/** Service work isn't tracked by whenStable: let storage promises settle, then render. */
async function settle(fixture: ComponentFixture<unknown>) {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const byTestId = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`);

async function renderDashboard(entries: readonly FoodEntry[], targets?: CurrentAssessment, before?: () => void) {
  const spies = configure(entries, targets);
  before?.();
  const fixture = TestBed.createComponent(NutritionPage);
  await settle(fixture);
  return { ...spies, fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Nutrition dashboard', () => {
  it('shows the day’s calories and macros against the calculated targets', async () => {
    const { el } = await renderDashboard([
      food('a', '2026-10-08', { calories: 420, proteinGrams: 30 }),
      food('b', '2026-10-08', { name: 'Chicken salad', meal: 'lunch', quantity: 1, unit: 'serving', calories: 1000, proteinGrams: 32 }),
    ]);
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Nutrition');
    expect(clean(byTestId(el, 'date-label'))).toBe('Thu, 8 Oct');
    expect(clean(byTestId(el, 'calorie-headline'))).toBe('1,420 of 2,000 kcal');
    expect(clean(byTestId(el, 'calorie-status'))).toBe('580 kcal remaining');
    expect(byTestId(el, 'calorie-summary')?.querySelector('fit-progress')?.getAttribute('aria-valuetext')).toBe('1,420 of 2,000 kcal, 580 kcal remaining');
    expect(clean(byTestId(el, 'macro-protein'))).toBe('Protein 62 g / 140 g');
    expect(byTestId(el, 'macro-protein')?.querySelector('fit-progress')?.getAttribute('aria-valuetext')).toBe('Protein: 62 g of 140 g, 78 g remaining');
    expect(clean(byTestId(el, 'macro-carbs'))).toBe('Carbs 80 g / 220 g');
    expect(byTestId(el, 'empty-day')).toBeNull();
  });

  it('lists meals with what was logged and subtotals; a meal expands to its food; empty meals add food', async () => {
    const { el, fixture } = await renderDashboard([
      food('a', '2026-10-08'),
      food('c', '2026-10-08', { name: 'Blueberries', quantity: 50, calories: 29, proteinGrams: 0.4 }),
      food('b', '2026-10-08', { name: 'Banana', meal: 'snacks', quantity: 1, unit: 'piece', calories: 105, proteinGrams: 1.3 }),
    ]);
    expect(clean(el.querySelector('#nutrition-meals'))).toBe('Meals');
    const breakfast = byTestId(el, 'meal-breakfast') as HTMLElement;
    expect(breakfast.getAttribute('aria-labelledby')).toBe('meal-breakfast');
    expect(clean(breakfast.querySelector('#meal-breakfast'))).toBe('Breakfast');
    expect(clean(byTestId(breakfast, 'meal-subtotal'))).toBe('259 kcal');
    const toggle = byTestId(breakfast, 'meal-toggle') as HTMLButtonElement;
    expect(clean(toggle)).toBe('Breakfast Oats, Blueberries 259 kcal');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect((breakfast.querySelector('.panel') as HTMLElement).hidden).toBe(true);

    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect((breakfast.querySelector('.panel') as HTMLElement).hidden).toBe(false);
    const row = byTestId(breakfast, 'food-row')!;
    expect(clean(row)).toBe('Oats 60 g · 8 g protein 230 kcal');
    expect(row.getAttribute('aria-label')).toBe('Edit Oats, 60 g, 230 kcal, 8 g protein');
    expect(byTestId(breakfast, 'add-food')?.getAttribute('aria-label')).toBe('Add food to Breakfast');
    expect(clean(byTestId(el, 'meal-snacks'))).toContain('Banana 1 piece · 1.3 g protein 105 kcal');

    const lunchAdd = byTestId(byTestId(el, 'meal-lunch') as HTMLElement, 'add-food')!;
    expect(clean(lunchAdd)).toBe('Lunch Nothing logged');
    expect(lunchAdd.getAttribute('aria-label')).toBe('Add food to Lunch');
  });

  it('a day strip of the shown week picks the day; days after today are disabled', async () => {
    const { el, fixture } = await renderDashboard([food('m', '2026-10-05', { name: 'Monday oats' })]);
    const strip = el.querySelector('app-nutrition-day-strip ol')!;
    expect(strip.getAttribute('aria-label')).toBe('Days this week');
    const days = [...strip.querySelectorAll('button')];
    expect(days.map((d) => clean(d))).toEqual(['Mon 5', 'Tue 6', 'Wed 7', 'Thu 8', 'Fri 9', 'Sat 10', 'Sun 11']);
    expect(days[3].getAttribute('aria-label')).toBe('Thursday 8 October, today');
    expect(days[3].getAttribute('aria-current')).toBe('date');
    expect(days.slice(4).every((d) => d.disabled)).toBe(true);

    days[0].click();
    await settle(fixture);
    expect(clean(byTestId(el, 'date-label'))).toBe('Mon, 5 Oct');
    expect(clean(byTestId(el, 'announcement'))).toBe('Monday, Oct 5');
    expect(byTestId(el, 'strip-2026-10-05')?.getAttribute('aria-current')).toBe('date');
    expect(clean(byTestId(el, 'meal-breakfast'))).toContain('Monday oats');
    expect(TestBed.inject(NutritionService).selectedDate()).toBe('2026-10-05');
  });

  it('opens add (with meal and date) and edit', async () => {
    const { el, forward, fixture } = await renderDashboard([food('a', '2026-10-08')]);
    (byTestId(byTestId(el, 'meal-dinner') as HTMLElement, 'add-food') as HTMLButtonElement).click();
    expect(forward).toHaveBeenCalledWith(['/nutrition', 'food', 'new'], { queryParams: { meal: 'dinner', date: '2026-10-08' } });
    (byTestId(el, 'meal-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    (byTestId(el, 'food-row') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(forward).toHaveBeenCalledWith(['/nutrition', 'food', 'a'], { queryParams: { date: '2026-10-08' } });
    (byTestId(el, 'log-food') as HTMLButtonElement).click();
    expect(forward).toHaveBeenCalledWith(['/nutrition', 'food', 'new'], { queryParams: { meal: 'lunch', date: '2026-10-08' } });
    (byTestId(el, 'open-week') as HTMLButtonElement).click();
    expect(forward).toHaveBeenCalledWith(['/nutrition', 'week'], { queryParams: { date: '2026-10-08' } });
    byTestId(el, 'open-check-in')!.querySelector('button')!.click();
    expect(forward).toHaveBeenCalledWith(['/nutrition', 'check-in']);
  });

  it('an empty day invites the first log', async () => {
    const { el, forward } = await renderDashboard([]);
    const empty = byTestId(el, 'empty-day')!;
    expect(clean(empty)).toContain('Start with your first meal');
    expect(clean(empty)).toContain('Log what you eat to see your daily nutrition here.');
    expect(clean(byTestId(el, 'calorie-headline'))).toBe('0 of 2,000 kcal');
    expect(clean(byTestId(el, 'log-food'))).toBe('Log food');
    (byTestId(el, 'log-food') as HTMLButtonElement).click();
    expect(forward).toHaveBeenCalledWith(['/nutrition', 'food', 'new'], { queryParams: { meal: 'lunch', date: '2026-10-08' } });
  });

  it('moves between days, never into the future, and back to Today', async () => {
    const { el, fixture } = await renderDashboard([food('y', '2026-10-07', { name: 'Yesterday soup', meal: 'dinner' })]);
    const next = byTestId(el, 'next-day') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    expect(next.getAttribute('aria-label')).toBe('Next day');
    expect(byTestId(el, 'go-today')).toBeNull();

    (byTestId(el, 'previous-day') as HTMLButtonElement).click();
    await settle(fixture);
    expect(clean(byTestId(el, 'date-label'))).toBe('Wed, 7 Oct');
    expect(clean(byTestId(el, 'announcement'))).toBe('Yesterday');
    expect(clean(byTestId(el, 'meal-dinner'))).toContain('Yesterday soup');
    expect((byTestId(el, 'next-day') as HTMLButtonElement).disabled).toBe(false);

    (byTestId(el, 'go-today') as HTMLButtonElement).click();
    await settle(fixture);
    expect(clean(byTestId(el, 'date-label'))).toBe('Thu, 8 Oct');
    expect(byTestId(el, 'empty-day')).not.toBeNull();
  });

  it('loading state', async () => {
    configure([]);
    vi.spyOn(TestBed.inject(NutritionRepository), 'loadDay').mockReturnValue(new Promise(() => undefined));
    const fixture = TestBed.createComponent(NutritionPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(byTestId(el, 'loading')?.getAttribute('aria-busy')).toBe('true');
    expect(clean(byTestId(el, 'announcement'))).toBe('Loading nutrition');
  });

  it('a storage error offers Retry', async () => {
    const { el, fixture } = await renderDashboard([], undefined, () => {
      vi.spyOn(TestBed.inject(NutritionRepository), 'loadDay').mockRejectedValueOnce(new Error('boom'));
    });
    expect(clean(byTestId(el, 'error'))).toContain("We couldn't load your food log");
    expect(byTestId(el, 'calorie-summary')).toBeNull();
    [...byTestId(el, 'error')!.querySelectorAll('button')].find((b) => clean(b) === 'Try again')!.click();
    await settle(fixture);
    expect(byTestId(el, 'error')).toBeNull();
    expect(byTestId(el, 'calorie-summary')).not.toBeNull();
  });

  it('without a profile: no targets, a set-up action, logging still available', async () => {
    const { el, navigateByUrl } = await renderDashboard([food('a', '2026-10-08')], { kind: 'no-profile' });
    expect(clean(byTestId(el, 'calorie-headline'))).toBe('230 kcal eaten');
    expect(byTestId(el, 'calorie-summary')?.querySelector('.ring.plain')).not.toBeNull();
    expect(clean(byTestId(el, 'calorie-status'))).toBe('No calorie target yet');
    expect(byTestId(el, 'calorie-summary')?.querySelector('fit-progress')).toBeNull();
    const notice = byTestId(el, 'notice-no-profile')!;
    expect(clean(notice)).toContain('You can still log food');
    notice.querySelector('button')!.click();
    expect(navigateByUrl).toHaveBeenCalledWith('/onboarding');
    expect(byTestId(el, 'add-food')).not.toBeNull();
  });

  it('target review: targets withheld, review action, logging still available', async () => {
    const { el, navigateByUrl } = await renderDashboard([], assessment({ finalKcal: 1100, status: 'review-required' }, { status: 'feasible', proteinGrams: 1, carbohydrateGrams: 1, fatGrams: 1 }));
    expect(clean(byTestId(el, 'calorie-headline'))).toBe('0 kcal eaten');
    expect(el.textContent).not.toContain('1,100');
    expect(clean(byTestId(el, 'macro-protein'))).toBe('Protein 0 g');
    byTestId(el, 'notice-calorie-review')!.querySelector('button')!.click();
    expect(navigateByUrl).toHaveBeenCalledWith('/onboarding/review');
    expect(byTestId(el, 'empty-day')).not.toBeNull();
  });

  it('infeasible macros keep the calorie target and explain the missing macro targets', async () => {
    const { el } = await renderDashboard([], assessment({ finalKcal: 1400, status: 'normal' }, { status: 'infeasible' }));
    expect(clean(byTestId(el, 'calorie-headline'))).toBe('0 of 1,400 kcal');
    expect(byTestId(el, 'notice-macros-infeasible')).not.toBeNull();
    expect(byTestId(el, 'macro-summary')?.querySelector('fit-progress')).toBeNull();
  });

  it('re-entering the tab refreshes targets without re-writing food logs', async () => {
    const { fixture, current, storage, el } = await renderDashboard([food('a', '2026-10-08')]);
    const page = fixture.componentInstance;
    page.ionViewWillEnter();
    current.mockResolvedValue(assessment({ finalKcal: 2500, status: 'normal' }, { status: 'feasible', proteinGrams: 150, carbohydrateGrams: 300, fatGrams: 80 }));
    const set = vi.spyOn(storage, 'set');
    page.ionViewWillEnter();
    await settle(fixture);
    expect(clean(byTestId(el, 'calorie-headline'))).toBe('230 of 2,500 kcal');
    expect(set).not.toHaveBeenCalled();
  });
});

async function renderPage<T>(component: Type<T>, entries: readonly FoodEntry[], inputs: Record<string, string>, before?: () => void) {
  const spies = configure(entries);
  before?.();
  const fixture = TestBed.createComponent(component);
  for (const [k, v] of Object.entries(inputs)) {
    fixture.componentRef.setInput(k, v);
  }
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const type = async (field: string, value: string) => {
    const input = byTestId(el, `field-${field}`)!.querySelector('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const choose = (field: string, label: string) => {
    const option = [...byTestId(el, `field-${field}`)!.querySelectorAll('label')].find((l) => clean(l) === label)!;
    option.querySelector('input')!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const click = async (id: string, root: Element = el) => {
    (byTestId(root as HTMLElement, id) as HTMLButtonElement).click();
    await settle(fixture);
  };
  return { ...spies, fixture, el, type, choose, click, service: TestBed.inject(NutritionService) };
}
const stored = (storage: MemoryKeyValueStorage): FoodEntry[] => JSON.parse(storage.values.get(KEY) ?? '{"entries":[]}').entries;

describe('Add food page', () => {
  async function renderAdd(entries: readonly FoodEntry[], inputs: Record<string, string>, before?: () => void) {
    const page = await renderPage(AddFoodPage, entries, inputs, before);
    const submit = async () => {
      byTestId(page.el, 'food-form')!.dispatchEvent(new Event('submit'));
      await settle(page.fixture);
    };
    /** Manual entry: the form, empty. */
    const manual = () => page.click('manual-entry');
    const search = async (text: string) => {
      const input = byTestId(page.el, 'food-search') as HTMLInputElement;
      input.value = text;
      input.dispatchEvent(new Event('input'));
      page.fixture.detectChanges();
    };
    return { ...page, submit, manual, search };
  }
  const yogurt = () => food('y', '2026-10-06', { name: 'Greek yogurt', quantity: 170, meal: 'breakfast', calories: 100, proteinGrams: 17.3 });
  const banana = () => food('b', '2026-10-05', { name: 'Banana', quantity: 1, unit: 'piece', meal: 'snacks', calories: 105, proteinGrams: 1.3 });

  it('is a dark screen for the chosen day and meal', async () => {
    const { el, fixture } = await renderAdd([], { meal: 'lunch', date: '2026-10-07' });
    expect(fixture.nativeElement.classList).toContain('fit-theme-immersive');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Add food');
    expect(clean(byTestId(el, 'form-day'))).toBe('Yesterday · Lunch');
    const meal = el.querySelector<HTMLInputElement>('input[name="add-food-meal"]:checked')!;
    expect(meal.value).toBe('lunch');
    expect(el.textContent).not.toMatch(/barcode/i);
  });

  it('lists recent foods and searches them by name; clear restores the list', async () => {
    const { el, search, fixture } = await renderAdd([yogurt(), banana()], { meal: 'lunch' });
    const names = () => [...el.querySelectorAll('[data-testid="recent-food"] .food-name')].map((n) => clean(n));
    expect(names()).toEqual(['Greek yogurt', 'Banana']);
    expect(clean(el.querySelector('[data-testid="recent-food"]'))).toBe('Greek yogurt 170 g · 100 kcal');
    expect(byTestId(el, 'quick-add')?.getAttribute('aria-label')).toBe('Add Greek yogurt, 170 g · 100 kcal, to Lunch');

    await search('  YOG ');
    expect(names()).toEqual(['Greek yogurt']);
    expect(clean(byTestId(el, 'result-count'))).toBe('1 recent food');

    await search('pizza');
    expect(names()).toEqual([]);
    expect(clean(byTestId(el, 'no-match'))).toBe('No recent foods match “pizza”.');

    (byTestId(el, 'clear-search') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(names()).toEqual(['Greek yogurt', 'Banana']);
    expect(byTestId(el, 'clear-search')).toBeNull();
    expect(document.activeElement).toBe(byTestId(el, 'food-search'));
  });

  it('no recent foods, and an unreadable log, each say so; manual entry stays available', async () => {
    const none = await renderAdd([], {});
    expect(clean(byTestId(none.el, 'recent-none'))).toContain('No recent foods yet');
    expect(byTestId(none.el, 'manual-entry')).not.toBeNull();
    TestBed.resetTestingModule();

    const failing = await renderAdd([], {}, () => {
      vi.spyOn(TestBed.inject(NutritionService), 'recentFoods').mockRejectedValue(new Error('boom'));
    });
    expect(clean(byTestId(failing.el, 'recent-error'))).toContain("We couldn't load your recent foods");
    expect(byTestId(failing.el, 'manual-entry')).not.toBeNull();
  });

  it('shows recent foods loading', async () => {
    configure([]);
    vi.spyOn(TestBed.inject(NutritionService), 'recentFoods').mockReturnValue(new Promise(() => undefined));
    const fixture = TestBed.createComponent(AddFoodPage);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    expect(byTestId(fixture.nativeElement, 'recent-loading')?.getAttribute('aria-busy')).toBe('true');
  });

  it('+ logs a recent food again to the chosen meal and day, once per tap, with feedback', async () => {
    const original = yogurt();
    const { el, fixture, storage, back, service } = await renderAdd([original], { meal: 'breakfast', date: '2026-10-07' });
    // The meal can be changed before adding.
    el.querySelector<HTMLInputElement>('input[name="add-food-meal"][value="dinner"]')!.click();
    fixture.detectChanges();
    const add = vi.spyOn(service, 'add');
    const plus = byTestId(el, 'quick-add') as HTMLButtonElement;
    expect(plus.getAttribute('aria-label')).toBe('Add Greek yogurt, 170 g · 100 kcal, to Dinner');
    plus.click();
    plus.click(); // a second tap while saving is ignored
    await settle(fixture);

    expect(add).toHaveBeenCalledTimes(1);
    const saved = stored(storage);
    expect(saved).toHaveLength(2);
    expect(saved[0]).toEqual(original);
    expect(saved[1]).toEqual(
      expect.objectContaining({ name: 'Greek yogurt', date: '2026-10-07', meal: 'dinner', quantity: 170, unit: 'g', nutrition: original.nutrition }),
    );
    expect(saved[1].id).not.toBe('y');
    expect(clean(byTestId(el, 'add-feedback'))).toBe('Added Greek yogurt to Dinner, yesterday.');
    expect(plus.classList).toContain('done');
    // A tap straight after the save (a double tap) doesn't log it again.
    plus.click();
    await settle(fixture);
    expect(add).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled(); // stays to add more
    // Nutrition shows the logged day.
    expect(service.selectedDate()).toBe('2026-10-07');
  });

  it('after the short cooldown the same food can be added again on purpose', async () => {
    const { el, fixture, storage } = await renderAdd([yogurt()], { meal: 'lunch' });
    const plus = byTestId(el, 'quick-add') as HTMLButtonElement;
    plus.click();
    await settle(fixture);
    expect(plus.disabled).toBe(true);
    await new Promise((r) => setTimeout(r, ADDED_COOLDOWN_MS + 50));
    fixture.detectChanges();
    expect(plus.disabled).toBe(false);
    plus.click();
    await settle(fixture);
    expect(stored(storage)).toHaveLength(3);
  });

  it('a failed one-tap add says so and saves nothing', async () => {
    const { el, fixture, storage } = await renderAdd([yogurt()], { meal: 'lunch' });
    storage.failWrites = true;
    (byTestId(el, 'quick-add') as HTMLButtonElement).click();
    await settle(fixture);
    expect(clean(byTestId(el, 'add-feedback'))).toBe("Greek yogurt couldn't be added. Please try again.");
    expect(stored(storage)).toHaveLength(1);
  });

  it('adds a food with manual values (decimal comma accepted) to the chosen meal and day', async () => {
    const { el, type, choose, submit, storage, back, manual } = await renderAdd([], { meal: 'lunch', date: '2026-10-07' });
    await manual();
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Enter food');
    expect(byTestId(el, 'field-quantity')!.querySelector('input')!.getAttribute('inputmode')).toBe('decimal');
    expect(byTestId(el, 'field-meal')!.querySelector('input:checked')!.closest('label')!.textContent).toContain('Lunch');
    expect(clean(byTestId(el, 'save'))).toBe('Save to yesterday');

    await type('name', 'Greek yogurt');
    await type('quantity', '170');
    choose('unit', 'Grams (g)');
    await type('calories', '100');
    await type('protein', '17,3');
    await type('carbs', '6');
    await type('fat', '0,7');
    await submit();

    expect(stored(storage)).toEqual([
      expect.objectContaining({ name: 'Greek yogurt', date: '2026-10-07', meal: 'lunch', quantity: 170, unit: 'g', nutrition: { calories: 100, proteinGrams: 17.3, carbohydrateGrams: 6, fatGrams: 0.7 } }),
    ]);
    expect(back).toHaveBeenCalledWith('/nutrition');
  });

  it('tapping a recent food opens it in the form to change first, then saves a new entry', async () => {
    const original = yogurt();
    const { el, fixture, submit, storage, back, type } = await renderAdd([original], { meal: 'lunch' });
    (byTestId(el, 'recent-food') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(byTestId(el, 'field-name')!.querySelector('input')!.value).toBe('Greek yogurt');
    expect(byTestId(el, 'field-meal')!.querySelector('input:checked')!.closest('label')!.textContent).toContain('Lunch');
    await type('quantity', '200');
    await type('calories', '118');
    await submit();
    const saved = stored(storage);
    expect(saved).toHaveLength(2);
    expect(saved[1]).toEqual(expect.objectContaining({ name: 'Greek yogurt', date: '2026-10-08', meal: 'lunch', quantity: 200 }));
    expect(saved[1].nutrition.calories).toBe(118);
    expect(saved[0]).toEqual(original);
    expect(back).toHaveBeenCalledWith('/nutrition');
  });

  it('back to search from the form', async () => {
    const { el, manual, click } = await renderAdd([yogurt()], {});
    await manual();
    expect(byTestId(el, 'food-form')).not.toBeNull();
    await click('back-to-search');
    expect(byTestId(el, 'food-form')).toBeNull();
    expect(byTestId(el, 'recent-food')).not.toBeNull();
  });

  it('shows field-level errors and saves nothing', async () => {
    const { el, type, submit, storage, back, manual } = await renderAdd([], { meal: 'breakfast' });
    await manual();
    await type('quantity', '0');
    await type('calories', '-5');
    await type('protein', 'abc');
    await type('carbs', '25000');
    await submit();
    const error = (f: string) => clean(byTestId(el, `field-${f}`)?.querySelector('.message.error'));
    expect(error('name')).toBe('Enter a food name.');
    expect(error('quantity')).toBe('Enter a quantity above 0.');
    expect(error('calories')).toBe('Calories can’t be negative.');
    expect(error('protein')).toBe('Enter a number, like 12 or 3.5.');
    expect(error('carbs')).toBe('Enter 1,000 g or less.');
    expect(error('fat')).toBe('Enter fat (0 is fine).');
    expect(byTestId(el, 'field-name')!.querySelector('input')!.getAttribute('aria-invalid')).toBe('true');
    expect(clean(byTestId(el, 'form-status'))).toBe('Check the highlighted fields.');
    expect(document.activeElement).toBe(byTestId(el, 'field-name')!.querySelector('input'));
    expect(storage.values.has(KEY)).toBe(false);
    expect(back).not.toHaveBeenCalled();

    await type('name', 'Rice');
    expect(error('name')).toBe('');
  });

  it('a future or invalid date falls back to today', async () => {
    const { el } = await renderAdd([], { date: '2027-01-01', meal: 'dinner' });
    expect(clean(byTestId(el, 'form-day'))).toBe('Today · Dinner');
  });

  it('a failed save is reported and the form stays', async () => {
    const { el, type, submit, storage, back, manual } = await renderAdd([], { meal: 'snacks' });
    await manual();
    for (const [f, v] of [['name', 'Apple'], ['quantity', '1'], ['calories', '95'], ['protein', '0.5'], ['carbs', '25'], ['fat', '0.3']]) {
      await type(f, v);
    }
    storage.failWrites = true;
    await submit();
    expect(clean(byTestId(el, 'form-status'))).toBe("Your food couldn't be saved. Please try again.");
    expect(back).not.toHaveBeenCalled();
    expect(byTestId(el, 'field-name')!.querySelector('input')!.value).toBe('Apple');
    expect((byTestId(el, 'save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('prevents double submission while saving', async () => {
    const { el, type, submit, storage, service, manual } = await renderAdd([], { meal: 'snacks' });
    await manual();
    for (const [f, v] of [['name', 'Apple'], ['quantity', '1'], ['calories', '95'], ['protein', '0'], ['carbs', '25'], ['fat', '0']]) {
      await type(f, v);
    }
    const add = vi.spyOn(service, 'add');
    byTestId(el, 'food-form')!.dispatchEvent(new Event('submit'));
    await submit();
    expect(add).toHaveBeenCalledTimes(1);
    expect(stored(storage)).toHaveLength(1);
  });

  it('rejects an ambiguous number visibly and saves nothing', async () => {
    const { el, type, submit, storage, back, manual } = await renderAdd([], { meal: 'lunch' });
    await manual();
    for (const [f, v] of [['name', 'Pasta'], ['quantity', '250'], ['calories', '1,234'], ['protein', '32,5'], ['carbs', '1.234,5'], ['fat', '9.5']]) {
      await type(f, v);
    }
    await submit();
    const error = (f: string) => clean(byTestId(el, `field-${f}`)?.querySelector('.message.error'));
    expect(error('calories')).toBe("Check number format. Use one decimal separator. Thousands separators aren't supported.");
    expect(error('carbs')).toBe(error('calories'));
    expect(error('protein')).toBe('');
    expect(error('fat')).toBe('');
    expect(document.activeElement).toBe(byTestId(el, 'field-calories')!.querySelector('input'));
    expect(storage.values.has(KEY)).toBe(false);
    expect(back).not.toHaveBeenCalled();

    await type('calories', '1234');
    await type('carbs', '45');
    await submit();
    expect(stored(storage)[0].nutrition).toEqual({ calories: 1234, proteinGrams: 32.5, carbohydrateGrams: 45, fatGrams: 9.5 });
    expect(back).toHaveBeenCalledWith('/nutrition');
  });

  it('after saving for another day than Nutrition shows, Nutrition switches to that day', async () => {
    const { type, submit, service, manual } = await renderAdd([], { date: '2026-10-08' });
    await service.load('2026-10-06');
    await manual();
    for (const [f, v] of [['name', 'Toast'], ['quantity', '1'], ['calories', '80'], ['protein', '3'], ['carbs', '15'], ['fat', '1']]) {
      await type(f, v);
    }
    await submit();
    expect(service.selectedDate()).toBe('2026-10-08');
    const state = service.state();
    expect(state.status === 'ready' && state.day.entries.map((e) => e.name)).toEqual(['Toast']);
  });
});

describe('Edit food page', () => {
  const chicken = () =>
    food('c', '2026-10-08', { name: 'Grilled chicken', meal: 'lunch', quantity: 100, unit: 'g', calories: 165, proteinGrams: 31, carbohydrateGrams: 0, fatGrams: 3.6 });
  const renderEdit = (entries: readonly FoodEntry[], inputs: Record<string, string>, before?: () => void) => renderPage(FoodEntryPage, entries, inputs, before);
  const values = (root: Element | null) => [...(root?.querySelectorAll('.nutrient') ?? [])].map((n) => clean(n));

  it('shows the food, its serving and per-serving and total values', async () => {
    const { el, fixture } = await renderEdit([chicken()], { entryId: 'c', date: '2026-10-08' });
    expect(fixture.nativeElement.classList).toContain('fit-theme-dashboard');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Edit food');
    expect(clean(byTestId(el, 'food-name'))).toBe('Grilled chicken');
    expect(clean(byTestId(el, 'form-day'))).toBe('Today · Lunch');
    expect(byTestId(el, 'field-serving')!.querySelector('input')!.value).toBe('100');
    expect(clean(byTestId(el, 'field-serving')!.querySelector('.suffix, [id$="-suffix"]'))).toBe('g');
    expect(values(byTestId(el, 'per-serving'))).toEqual(['kcal 165', 'Protein 31 g', 'Carbs 0 g', 'Fat 3.6 g']);
    expect(clean(byTestId(el, 'servings'))).toBe('1');
    expect(clean(byTestId(el, 'save'))).toBe('Save changes');
  });

  it('servings and serving size update the totals live (domain scaling, decimals)', async () => {
    const { el, fixture, type } = await renderEdit([chicken()], { entryId: 'c', date: '2026-10-08' });
    (byTestId(el, 'more') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(clean(byTestId(el, 'servings'))).toBe('1.5');
    expect(values(byTestId(el, 'total'))).toEqual(['kcal 248', 'Protein 46.5 g', 'Carbs 0 g', 'Fat 5.4 g']);
    expect(clean(byTestId(el, 'total')!.querySelector('[aria-live]'))).toBe('Total: 248 kcal, 46.5 g protein, 0 g carbs, 5.4 g fat');

    await type('serving', '150,5');
    expect(values(byTestId(el, 'per-serving'))).toEqual(['kcal 248', 'Protein 46.7 g', 'Carbs 0 g', 'Fat 5.4 g']);
    expect(values(byTestId(el, 'total'))[0]).toBe('kcal 373'); // 165 × 225.75 / 100 = 372.49 → stored 372.5 → shown 373

    (byTestId(el, 'fewer') as HTMLButtonElement).click();
    (byTestId(el, 'fewer') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(clean(byTestId(el, 'servings'))).toBe('0.5');
    expect((byTestId(el, 'fewer') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a missing serving size shows no total (never zero) and blocks saving', async () => {
    const { el, type, click, storage, back } = await renderEdit([chicken()], { entryId: 'c', date: '2026-10-08' });
    await type('serving', '');
    expect(byTestId(el, 'total')!.querySelector('.nutrients')).toBeNull();
    expect(clean(byTestId(el, 'total'))).toContain('Enter a serving size to see the total.');
    expect(clean(byTestId(el, 'field-serving')?.querySelector('.message.error'))).toBe('');
    await click('save');
    expect(clean(byTestId(el, 'field-serving')?.querySelector('.message.error'))).toBe('Enter a serving size.');
    expect(clean(byTestId(el, 'form-status'))).toBe('Check the highlighted fields.');
    expect(document.activeElement).toBe(byTestId(el, 'field-serving')!.querySelector('input'));
    expect(stored(storage)).toEqual([chicken()]);
    expect(back).not.toHaveBeenCalled();

    await type('serving', '1,234');
    expect(clean(byTestId(el, 'field-serving')?.querySelector('.message.error'))).toBe(
      "Check number format. Use one decimal separator. Thousands separators aren't supported.",
    );
  });

  it('saves the portion and meal to the same entry (no duplicate)', async () => {
    const original = chicken();
    const { el, fixture, click, storage, back, service } = await renderEdit([original], { entryId: 'c', date: '2026-10-08' });
    const add = vi.spyOn(service, 'add');
    (byTestId(el, 'more') as HTMLButtonElement).click();
    el.querySelector<HTMLInputElement>('input[name="edit-food-meal"][value="dinner"]')!.click();
    fixture.detectChanges();
    await click('save');
    expect(add).not.toHaveBeenCalled();
    expect(stored(storage)).toEqual([
      {
        ...original,
        meal: 'dinner',
        quantity: 150,
        nutrition: { calories: 247.5, proteinGrams: 46.5, carbohydrateGrams: 0, fatGrams: 5.4 },
        updatedAt: NOW.toISOString(),
      },
    ]);
    expect(back).toHaveBeenCalledWith('/nutrition');
  });

  it('edits name and values in the full form, keeping the id and creation time', async () => {
    const original = food('a', '2026-10-08');
    const { el, type, choose, click, storage, back } = await renderEdit([original], { entryId: 'a', date: '2026-10-08' });
    await click('edit-details');
    expect(byTestId(el, 'field-name')!.querySelector('input')!.value).toBe('Oats');
    expect(byTestId(el, 'field-calories')!.querySelector('input')!.value).toBe('230');

    await type('name', 'Rolled oats');
    await type('calories', '250');
    choose('meal', 'Snacks');
    await click('save');
    expect(stored(storage)).toEqual([
      { ...original, name: 'Rolled oats', meal: 'snacks', nutrition: { ...original.nutrition, calories: 250 }, updatedAt: NOW.toISOString() },
    ]);
    expect(back).toHaveBeenCalledWith('/nutrition');
  });

  it('prevents double submission while saving', async () => {
    const { el, fixture, storage, service } = await renderEdit([chicken()], { entryId: 'c', date: '2026-10-08' });
    const update = vi.spyOn(service, 'update');
    (byTestId(el, 'save') as HTMLButtonElement).click();
    (byTestId(el, 'save') as HTMLButtonElement).click();
    await settle(fixture);
    expect(update).toHaveBeenCalledTimes(1);
    expect(stored(storage)).toHaveLength(1);
  });

  it('a failed save is reported and nothing changes', async () => {
    const { el, click, storage, back } = await renderEdit([chicken()], { entryId: 'c', date: '2026-10-08' });
    storage.failWrites = true;
    await click('save');
    expect(clean(byTestId(el, 'form-status'))).toBe("Your food couldn't be saved. Please try again.");
    expect(back).not.toHaveBeenCalled();
  });

  it('close returns to Nutrition without saving', async () => {
    const { click, storage, back } = await renderEdit([chicken()], { entryId: 'c', date: '2026-10-08' });
    await click('close');
    expect(back).toHaveBeenCalledWith('/nutrition');
    expect(stored(storage)).toEqual([chicken()]);
  });

  it('deletes only after confirmation', async () => {
    const { el, fixture, storage, back } = await renderEdit([food('a', '2026-10-08')], { entryId: 'a', date: '2026-10-08' });
    const page = fixture.componentInstance as unknown as { confirmOpen: () => boolean; cancelDelete(): void; confirmDelete(): Promise<void> };
    expect(byTestId(el, 'delete')?.getAttribute('aria-label')).toBe('Delete food');
    (byTestId(el, 'delete') as HTMLButtonElement).click();
    expect(page.confirmOpen()).toBe(true);
    page.cancelDelete();
    expect(page.confirmOpen()).toBe(false);
    expect(stored(storage)).toHaveLength(1);

    (byTestId(el, 'delete') as HTMLButtonElement).click();
    await page.confirmDelete();
    expect(stored(storage)).toEqual([]);
    expect(back).toHaveBeenCalledWith('/nutrition');
  });

  it('a failed delete keeps the entry and says so', async () => {
    const { el, fixture, storage, back } = await renderEdit([food('a', '2026-10-08')], { entryId: 'a', date: '2026-10-08' });
    const page = fixture.componentInstance as unknown as { confirmDelete(): Promise<void> };
    storage.failWrites = true;
    (byTestId(el, 'delete') as HTMLButtonElement).click();
    await page.confirmDelete();
    fixture.detectChanges();
    expect(clean(byTestId(el, 'form-status'))).toBe("This food couldn't be deleted. Please try again.");
    expect(stored(storage)).toHaveLength(1);
    expect(back).not.toHaveBeenCalled();
  });

  it('an entry that no longer exists', async () => {
    const { el, back } = await renderEdit([], { entryId: 'gone', date: '2026-10-08' });
    expect(clean(byTestId(el, 'not-found'))).toContain('Food not found');
    expect(byTestId(el, 'save')).toBeNull();
    expect(byTestId(el, 'delete')).toBeNull();
    byTestId(el, 'not-found')!.querySelector('button')!.click();
    expect(back).toHaveBeenCalledWith('/nutrition');
  });

  it('an unreadable food log offers Retry', async () => {
    const { el } = await renderEdit([], { entryId: 'a', date: '2026-10-08' }, () => {
      vi.spyOn(TestBed.inject(NutritionRepository), 'loadDay').mockRejectedValueOnce(new Error('boom'));
    });
    expect(clean(byTestId(el, 'load-error'))).toContain("We couldn't load this food");
  });
});
