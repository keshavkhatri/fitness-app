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
    expect(clean(byTestId(el, 'date-label'))).toBe('Today');
    expect(clean(byTestId(el, 'calorie-headline'))).toBe('1,420 / 2,000 kcal');
    expect(clean(byTestId(el, 'calorie-status'))).toBe('580 kcal remaining');
    expect(byTestId(el, 'calorie-summary')?.querySelector('fit-progress')?.getAttribute('aria-valuetext')).toBe('1,420 of 2,000 kcal, 580 kcal remaining');
    expect(clean(byTestId(el, 'macro-protein'))).toBe('Protein 62 g / 140 g 78 g remaining');
    expect(clean(byTestId(el, 'macro-carbs'))).toBe('Carbs 80 g / 220 g 140 g remaining');
    expect(byTestId(el, 'empty-day')).toBeNull();
  });

  it('lists food by meal with subtotals; empty meals get a compact Add Food', async () => {
    const { el } = await renderDashboard([food('a', '2026-10-08'), food('b', '2026-10-08', { name: 'Banana', meal: 'snacks', quantity: 1, unit: 'piece', calories: 105, proteinGrams: 1.3 })]);
    const breakfast = byTestId(el, 'meal-breakfast')!;
    expect(clean(breakfast.querySelector('h2'))).toBe('Breakfast');
    expect(clean(byTestId(breakfast as HTMLElement, 'meal-subtotal'))).toBe('230 kcal');
    const row = byTestId(breakfast as HTMLElement, 'food-row')!;
    expect(clean(row)).toBe('Oats 60 g · 8 g protein 230 kcal');
    expect(row.getAttribute('aria-label')).toBe('Edit Oats, 60 g, 230 kcal, 8 g protein');
    expect(clean(byTestId(el, 'meal-snacks'))).toContain('Banana 1 piece · 1.3 g protein 105 kcal');
    const lunchAdd = byTestId(byTestId(el, 'meal-lunch') as HTMLElement, 'add-food')!;
    expect(lunchAdd.classList).toContain('compact');
    expect(lunchAdd.getAttribute('aria-label')).toBe('Add food to Lunch');
  });

  it('opens add (with meal and date) and edit', async () => {
    const { el, forward, fixture } = await renderDashboard([food('a', '2026-10-08')]);
    (byTestId(byTestId(el, 'meal-dinner') as HTMLElement, 'add-food') as HTMLButtonElement).click();
    expect(forward).toHaveBeenCalledWith(['/nutrition', 'food', 'new'], { queryParams: { meal: 'dinner', date: '2026-10-08' } });
    (byTestId(el, 'food-row') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(forward).toHaveBeenCalledWith(['/nutrition', 'food', 'a'], { queryParams: { date: '2026-10-08' } });
  });

  it('an empty day invites the first log', async () => {
    const { el, forward } = await renderDashboard([]);
    const empty = byTestId(el, 'empty-day')!;
    expect(clean(empty)).toContain('Start with your first meal');
    expect(clean(empty)).toContain('Log what you eat to see your daily nutrition here.');
    expect(clean(byTestId(el, 'calorie-headline'))).toBe('0 / 2,000 kcal');
    [...empty.querySelectorAll('button')].find((b) => clean(b) === 'Log Food')!.click();
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
    expect(clean(byTestId(el, 'date-label'))).toBe('Yesterday');
    expect(clean(byTestId(el, 'announcement'))).toBe('Yesterday');
    expect(clean(byTestId(el, 'meal-dinner'))).toContain('Yesterday soup');
    expect((byTestId(el, 'next-day') as HTMLButtonElement).disabled).toBe(false);

    (byTestId(el, 'go-today') as HTMLButtonElement).click();
    await settle(fixture);
    expect(clean(byTestId(el, 'date-label'))).toBe('Today');
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
    expect(clean(byTestId(el, 'calorie-headline'))).toBe('0 / 1,400 kcal');
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
    expect(clean(byTestId(el, 'calorie-headline'))).toBe('230 / 2,500 kcal');
    expect(set).not.toHaveBeenCalled();
  });
});

describe('Food entry page', () => {
  async function renderForm(entries: readonly FoodEntry[], inputs: Record<string, string>, before?: () => void) {
    const spies = configure(entries);
    before?.();
    const fixture = TestBed.createComponent(FoodEntryPage);
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
    const submit = async () => {
      byTestId(el, 'food-form')!.dispatchEvent(new Event('submit'));
      await settle(fixture);
    };
    return { ...spies, fixture, el, type, choose, submit, service: TestBed.inject(NutritionService) };
  }
  const stored = (storage: MemoryKeyValueStorage): FoodEntry[] => JSON.parse(storage.values.get(KEY) ?? '{"entries":[]}').entries;

  it('adds a food with manual values (decimal comma accepted) to the chosen meal and day', async () => {
    const { el, type, choose, submit, storage, back } = await renderForm([], { meal: 'lunch', date: '2026-10-07' });
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Add food');
    expect(clean(byTestId(el, 'form-day'))).toBe('Yesterday');
    expect(byTestId(el, 'field-quantity')!.querySelector('input')!.getAttribute('inputmode')).toBe('decimal');
    expect(byTestId(el, 'field-meal')!.querySelector('input:checked')!.closest('label')!.textContent).toContain('Lunch');
    expect(byTestId(el, 'delete')).toBeNull();

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

  it('fills in the form from a recent food, keeping the chosen meal and day, and saves a new entry', async () => {
    const yogurt = food('y', '2026-10-06', { name: 'Greek yogurt', quantity: 170, meal: 'breakfast', calories: 100, proteinGrams: 17.3 });
    const { el, fixture, submit, storage, back } = await renderForm([yogurt], { meal: 'lunch' });
    const rows = el.querySelectorAll<HTMLButtonElement>('[data-testid="recent-food"]');
    expect(rows).toHaveLength(1);
    expect(clean(rows[0])).toContain('Greek yogurt');
    rows[0].click();
    fixture.detectChanges();
    expect(byTestId(el, 'field-name')!.querySelector('input')!.value).toBe('Greek yogurt');
    expect(clean(byTestId(el, 'recent-status'))).toBe('Filled in Greek yogurt. Check the values, then save.');
    await submit();
    const saved = stored(storage);
    expect(saved).toHaveLength(2);
    expect(saved[1]).toEqual(
      expect.objectContaining({ name: 'Greek yogurt', date: '2026-10-08', meal: 'lunch', quantity: 170, nutrition: yogurt.nutrition }),
    );
    expect(saved[1].id).not.toBe('y');
    expect(saved[0]).toEqual(yogurt);
    expect(back).toHaveBeenCalledWith('/nutrition');
  });

  it('shows no recent foods when editing', async () => {
    const yogurt = food('y', '2026-10-08', { name: 'Greek yogurt' });
    const { el } = await renderForm([yogurt], { entryId: 'y', date: '2026-10-08' });
    expect(byTestId(el, 'recent-foods')).toBeNull();
  });

  it('shows field-level errors and saves nothing', async () => {
    const { el, type, submit, storage, back } = await renderForm([], { meal: 'breakfast' });
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
    const { el } = await renderForm([], { date: '2027-01-01' });
    expect(clean(byTestId(el, 'form-day'))).toBe('Today');
  });

  it('a failed save is reported and the form stays', async () => {
    const { el, type, submit, storage, back } = await renderForm([], { meal: 'snacks' });
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
    const { el, type, submit, storage, service } = await renderForm([], { meal: 'snacks' });
    for (const [f, v] of [['name', 'Apple'], ['quantity', '1'], ['calories', '95'], ['protein', '0'], ['carbs', '25'], ['fat', '0']]) {
      await type(f, v);
    }
    const add = vi.spyOn(service, 'add');
    byTestId(el, 'food-form')!.dispatchEvent(new Event('submit'));
    await submit();
    expect(add).toHaveBeenCalledTimes(1);
    expect(stored(storage)).toHaveLength(1);
  });

  it('edits an entry, keeping its id and creation time', async () => {
    const original = food('a', '2026-10-08');
    const { el, type, choose, submit, storage, back } = await renderForm([original], { entryId: 'a', date: '2026-10-08' });
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Edit food');
    expect(byTestId(el, 'field-name')!.querySelector('input')!.value).toBe('Oats');
    expect(byTestId(el, 'field-calories')!.querySelector('input')!.value).toBe('230');
    expect(clean(byTestId(el, 'save'))).toBe('Save changes');

    await type('calories', '250');
    choose('meal', 'Snacks');
    await submit();
    expect(stored(storage)).toEqual([
      { ...original, meal: 'snacks', nutrition: { ...original.nutrition, calories: 250 }, updatedAt: NOW.toISOString() },
    ]);
    expect(back).toHaveBeenCalledWith('/nutrition');
  });

  it('deletes only after confirmation', async () => {
    const { el, fixture, storage, back } = await renderForm([food('a', '2026-10-08')], { entryId: 'a', date: '2026-10-08' });
    const page = fixture.componentInstance as unknown as { confirmOpen: () => boolean; cancelDelete(): void; confirmDelete(): Promise<void> };
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
    const { el, fixture, storage, back } = await renderForm([food('a', '2026-10-08')], { entryId: 'a', date: '2026-10-08' });
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
    const { el, back } = await renderForm([], { entryId: 'gone', date: '2026-10-08' });
    expect(clean(byTestId(el, 'not-found'))).toContain('Food not found');
    expect(byTestId(el, 'save')).toBeNull();
    byTestId(el, 'not-found')!.querySelector('button')!.click();
    expect(back).toHaveBeenCalledWith('/nutrition');
  });

  it('an unreadable food log offers Retry', async () => {
    const { el } = await renderForm([], { entryId: 'a', date: '2026-10-08' }, () => {
      vi.spyOn(TestBed.inject(NutritionRepository), 'loadDay').mockRejectedValueOnce(new Error('boom'));
    });
    expect(clean(byTestId(el, 'load-error'))).toContain("We couldn't load this food");
  });

  it('rejects an ambiguous number visibly and saves nothing', async () => {
    const { el, type, submit, storage, back } = await renderForm([], { meal: 'lunch' });
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
    const { type, submit, service } = await renderForm([], { date: '2026-10-08' });
    await service.load('2026-10-06');
    for (const [f, v] of [['name', 'Toast'], ['quantity', '1'], ['calories', '80'], ['protein', '3'], ['carbs', '15'], ['fat', '1']]) {
      await type(f, v);
    }
    await submit();
    expect(service.selectedDate()).toBe('2026-10-08');
    const state = service.state();
    expect(state.status === 'ready' && state.day.entries.map((e) => e.name)).toEqual(['Toast']);
  });
});
