import { NutritionState, TargetState } from '../../core/nutrition/nutrition.service';
import { FoodEntry, FoodEntryInput, createFoodEntry, nutritionDay, validateFoodEntryInput } from '../../domain/nutrition';
import { emptyFoodForm, foodFormOf, formErrorsOf, parseNumberField, readFoodForm } from './food-form';
import { formatQuantity, suggestedMeal, toDateHeader, toDayStrip, toDaySummary, toFoodRow, toNutritionScreen } from './nutrition-view-model';

const INPUT: FoodEntryInput = { name: 'Oats', quantity: 60, unit: 'g', meal: 'breakfast', calories: 230, proteinGrams: 8, carbohydrateGrams: 40, fatGrams: 4 };
const food = (id: string, overrides: Partial<FoodEntryInput> = {}): FoodEntry => {
  const r = createFoodEntry({ ...INPUT, ...overrides }, { id, date: '2026-10-08', now: '2026-10-08T08:00:00.000Z' });
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
};
const TARGETS: TargetState = {
  kind: 'available',
  targets: {
    calories: { kind: 'target', kcal: 2000, adjusted: false },
    macros: { kind: 'target', proteinGrams: 140, carbohydrateGrams: 220, fatGrams: 65, constrained: false },
  },
};
const readyState = (entries: FoodEntry[], targets: TargetState = TARGETS): NutritionState => ({
  status: 'ready',
  date: '2026-10-08',
  day: nutritionDay(entries, '2026-10-08'),
  targets,
});
const screenOf = (entries: FoodEntry[], targets?: TargetState) => {
  const s = toNutritionScreen(readyState(entries, targets));
  if (s.kind !== 'ready') {
    throw new Error(s.kind);
  }
  return s;
};

describe('nutrition view model', () => {
  it('summarises calories eaten against the calculated target', () => {
    const s = screenOf([food('a', { calories: 1420, proteinGrams: 62 })]);
    expect(s.calories).toMatchObject({ headline: '1,420 / 2,000 kcal', status: '580 kcal remaining', over: false });
    expect(s.calories.progress).toEqual({ value: 1420, max: 2000, valueText: '1,420 of 2,000 kcal, 580 kcal remaining' });
  });

  it('describes going over the target neutrally', () => {
    const s = screenOf([food('a', { calories: 2120 })]);
    expect(s.calories).toMatchObject({ status: '120 kcal over target', over: true });
    expect(s.calories.progress?.value).toBe(2000);
  });

  it('keeps displayed numbers consistent (eaten + remaining = target)', () => {
    const s = screenOf([food('a', { calories: 1419.6 })]);
    expect(s.calories).toMatchObject({ eaten: '1,420', status: '580 kcal remaining' });
  });

  it('macro rows: eaten, target and remaining/over', () => {
    const s = screenOf([food('a', { proteinGrams: 62.4, carbohydrateGrams: 230, fatGrams: 65 })]);
    expect(s.macros.map((m) => [m.label, m.eaten, m.target, m.status])).toEqual([
      ['Protein', '62.4 g', '140 g', '77.6 g remaining'],
      ['Carbs', '230 g', '220 g', '10 g over'],
      ['Fat', '65 g', '65 g', '0 g remaining'],
    ]);
  });

  it('meal sections with subtotals and food rows', () => {
    const s = screenOf([food('a'), food('b', { name: 'Chicken', meal: 'dinner', quantity: 1.5, unit: 'serving', calories: 330.4, proteinGrams: 62.1 })]);
    expect(s.meals.map((m) => [m.title, m.subtotal, m.entries.length])).toEqual([
      ['Breakfast', '230 kcal', 1],
      ['Lunch', '0 kcal', 0],
      ['Dinner', '330 kcal', 1],
      ['Snacks', '0 kcal', 0],
    ]);
    expect(s.meals[2].entries[0]).toEqual({
      id: 'b',
      name: 'Chicken',
      detail: '1.5 servings · 62.1 g protein',
      calories: '330 kcal',
      ariaLabel: 'Edit Chicken, 1.5 servings, 330 kcal, 62.1 g protein',
    });
    expect(s.meals[1].addLabel).toBe('Add food to Lunch');
    expect(s.meals.map((m) => m.summary)).toEqual(['Oats', 'Nothing logged', 'Chicken', 'Nothing logged']);
    expect(s.isEmpty).toBe(false);
  });

  it('an empty day', () => {
    const s = screenOf([]);
    expect(s.isEmpty).toBe(true);
    expect(s.calories).toMatchObject({ headline: '0 / 2,000 kcal', status: '2,000 kcal remaining' });
  });

  it('without a profile: only what was eaten, with a set-up notice (no invented target)', () => {
    const s = screenOf([food('a')], { kind: 'no-profile' });
    expect(s.calories).toMatchObject({ headline: '230 kcal eaten', target: null, status: null, progress: null });
    expect(s.macros.every((m) => m.target === null && m.progress === null)).toBe(true);
    expect(s.notices.map((n) => [n.id, n.action?.kind])).toEqual([['no-profile', 'set-up-profile']]);
  });

  it('calculation unavailable', () => {
    const s = screenOf([], { kind: 'unavailable' });
    expect(s.calories.target).toBeNull();
    expect(s.notices.map((n) => n.id)).toEqual(['unavailable']);
  });

  it('review required withholds calorie and macro targets with one review notice', () => {
    const s = screenOf([food('a')], {
      kind: 'available',
      targets: { calories: { kind: 'review-required' }, macros: { kind: 'withheld', reason: 'calorie-review' } },
    });
    expect(s.calories.target).toBeNull();
    expect(s.macros.every((m) => m.target === null)).toBe(true);
    expect(s.notices.map((n) => [n.id, n.tone, n.action?.kind])).toEqual([['calorie-review', 'warning', 'review-profile']]);
  });

  it('constrained, infeasible and adjusted targets are explained', () => {
    const base = TARGETS.kind === 'available' ? TARGETS.targets : null!;
    const constrained = screenOf([], {
      kind: 'available',
      targets: { calories: { kind: 'target', kcal: 1500, adjusted: true }, macros: { ...base.macros, constrained: true } as never },
    });
    expect(constrained.notices.map((n) => n.id)).toEqual(['calorie-adjusted', 'macros-constrained']);
    expect(constrained.macros[0].target).toBe('140 g');

    const infeasible = screenOf([], { kind: 'available', targets: { calories: base.calories, macros: { kind: 'withheld', reason: 'infeasible' } } });
    expect(infeasible.calories.target).toBe('2,000');
    expect(infeasible.macros.every((m) => m.target === null)).toBe(true);
    expect(infeasible.notices.map((n) => n.id)).toEqual(['macros-infeasible']);
  });

  it('loading and error screens', () => {
    expect(toNutritionScreen({ status: 'loading', date: '2026-10-08' })).toEqual({ kind: 'loading' });
    expect(toNutritionScreen({ status: 'error', date: '2026-10-08' })).toEqual({ kind: 'error' });
  });

  it('date header: today, yesterday, older; never past today', () => {
    expect(toDateHeader('2026-10-08', '2026-10-08')).toEqual({ label: 'Today', date: 'Thu, 8 Oct', isToday: true, canGoNext: false });
    expect(toDateHeader('2026-10-07', '2026-10-08')).toEqual({ label: 'Yesterday', date: 'Wed, 7 Oct', isToday: false, canGoNext: true });
    expect(toDateHeader('2026-10-05', '2026-10-08').label).toBe('Monday, Oct 5');
    expect(toDateHeader('2025-12-31', '2026-01-01')).toMatchObject({ label: 'Yesterday', date: 'Wed, 31 Dec 2025' });
  });

  it('day strip: Monday–Sunday of the selected day’s week; days after today disabled', () => {
    const strip = toDayStrip('2026-10-06', '2026-10-08');
    expect(strip.map((d) => `${d.weekday} ${d.day}`)).toEqual(['Mon 5', 'Tue 6', 'Wed 7', 'Thu 8', 'Fri 9', 'Sat 10', 'Sun 11']);
    expect(strip.filter((d) => d.selected).map((d) => d.date)).toEqual(['2026-10-06']);
    expect(strip.filter((d) => d.isToday).map((d) => d.ariaLabel)).toEqual(['Thursday 8 October, today']);
    expect(strip.map((d) => d.disabled)).toEqual([false, false, false, false, true, true, true]);
    // A week across a month and year boundary.
    expect(toDayStrip('2026-12-31', '2027-01-10').map((d) => d.day)).toEqual(['28', '29', '30', '31', '1', '2', '3']);
    expect(toDayStrip('not-a-date', '2026-10-08')).toEqual([]);
  });

  it('formats quantities and suggests a meal by local time', () => {
    expect(formatQuantity(150, 'g')).toBe('150 g');
    expect(formatQuantity(1, 'piece')).toBe('1 piece');
    expect(formatQuantity(2.25, 'serving')).toBe('2.25 servings');
    expect(toFoodRow(food('x', { name: 'Coffee', calories: 2, proteinGrams: 0.3, unit: 'ml', quantity: 250 })).detail).toBe('250 ml · 0.3 g protein');
    expect([7, 12, 19, 23].map((h) => suggestedMeal(new Date(2026, 9, 8, h)))).toEqual(['breakfast', 'lunch', 'dinner', 'snacks']);
  });
});

describe('food form', () => {
  const FORMAT = "Check number format. Use one decimal separator. Thousands separators aren't supported.";

  it('parses typed numbers with a decimal dot or comma', () => {
    expect(parseNumberField('32.5')).toBe(32.5);
    expect(parseNumberField(' 32,5 ')).toBe(32.5);
    expect(parseNumberField('0')).toBe(0);
    expect(parseNumberField('')).toBeNull();
    expect(parseNumberField('   ')).toBeNull();
    expect(parseNumberField('-3')).toBe(-3);
    for (const text of ['abc', '1e3', 'NaN', 'Infinity']) {
      expect(parseNumberField(text)).toBeNaN();
    }
  });

  it('never saves 1,234 as 1.234: ambiguous fields are reported and can’t pass validation', () => {
    const { input, formatErrors } = readFoodForm({ ...foodFormOf(food('a')), calories: '1,234', proteinGrams: '1.234,5', carbohydrateGrams: '1,234.5', quantity: '1.500' });
    expect(formatErrors).toEqual({ calories: FORMAT, proteinGrams: FORMAT, carbohydrateGrams: FORMAT, quantity: FORMAT });
    expect(input.calories).toBeNaN();
    expect(input.quantity).toBeNaN();
    const errors = validateFoodEntryInput(input);
    expect(Object.keys(errors).sort()).toEqual(['calories', 'carbohydrateGrams', 'proteinGrams', 'quantity']);
    expect(formErrorsOf(errors, formatErrors).calories).toBe(FORMAT);
  });

  it('out-of-range and negative values are left to domain validation', () => {
    const { input, formatErrors } = readFoodForm({ ...foodFormOf(food('a')), calories: '25000', fatGrams: '-1', quantity: '0' });
    expect(formatErrors).toEqual({});
    expect(formErrorsOf(validateFoodEntryInput(input))).toEqual({
      calories: 'Enter 10,000 kcal or less.',
      fatGrams: 'Fat can’t be negative.',
      quantity: 'Enter a quantity above 0.',
    });
  });

  it('existing entries reopen and save unchanged (stored values are never ambiguous)', () => {
    for (const overrides of [
      { quantity: 1.5, unit: 'serving' as const, calories: 99.5 },
      { quantity: 1000, calories: 1000.5, proteinGrams: 100, carbohydrateGrams: 999.9, fatGrams: 0 },
      { quantity: 0.25, calories: 10000, proteinGrams: 1000, carbohydrateGrams: 0.1, fatGrams: 12.3 },
    ]) {
      const entry = food('a', overrides);
      const { input, formatErrors } = readFoodForm(foodFormOf(entry));
      expect(formatErrors).toEqual({});
      expect(input).toEqual({ ...INPUT, ...overrides });
    }
    expect(readFoodForm(emptyFoodForm('lunch')).input).toMatchObject({ name: '', quantity: null, meal: 'lunch', calories: null });
  });

  it('maps domain problems to messages', () => {
    expect(formErrorsOf({ name: 'required', quantity: 'not-positive', calories: 'too-large', fatGrams: 'negative' })).toEqual({
      name: 'Enter a food name.',
      quantity: 'Enter a quantity above 0.',
      calories: 'Enter 10,000 kcal or less.',
      fatGrams: 'Fat can’t be negative.',
    });
  });
});

describe('day summary (shared with Home)', () => {
  const day = (entries: FoodEntry[]) => nutritionDay(entries, '2026-10-08');

  it('gives the balance alone and the totals, all formatted', () => {
    const s = toDaySummary(day([food('a', { calories: 1420.4, proteinGrams: 62 })]), TARGETS);
    expect(s.calories).toMatchObject({ eaten: '1,420', target: '2,000', balance: '580', over: false });
    expect(toDaySummary(day([food('a', { calories: 2120 })]), TARGETS).calories).toMatchObject({ balance: '120', over: true });
    expect(s.macros.map((m) => `${m.label} ${m.eaten} / ${m.target}`)).toEqual(['Protein 62 g / 140 g', 'Carbs 40 g / 220 g', 'Fat 4 g / 65 g']);
    expect(s.targetNote).toBeNull();
  });

  it('withheld or unavailable targets: intake only, with a one-line note', () => {
    const review = toDaySummary(day([food('a')]), { kind: 'available', targets: { calories: { kind: 'review-required' }, macros: { kind: 'withheld', reason: 'calorie-review' } } });
    expect(review.calories).toMatchObject({ eaten: '230', target: null, balance: null, progress: null });
    expect(review.targetNote).toBe('Your targets need review.');
    expect(toDaySummary(day([]), { kind: 'unavailable' }).targetNote).toBe("Targets aren't available right now.");
    expect(toDaySummary(day([]), { kind: 'no-profile' }).targetNote).toBe('Set up your profile to see your daily targets.');
    const base = TARGETS.kind === 'available' ? TARGETS.targets : null!;
    const infeasible = toDaySummary(day([]), { kind: 'available', targets: { calories: base.calories, macros: { kind: 'withheld', reason: 'infeasible' } } });
    expect(infeasible.calories.target).toBe('2,000');
    expect(infeasible.targetNote).toBe('Your macro targets need review.');
    // Informational notices (adjusted/constrained) don't add a note.
    expect(toDaySummary(day([]), { kind: 'available', targets: { calories: { kind: 'target', kcal: 1500, adjusted: true }, macros: { ...base.macros, constrained: true } as never } }).targetNote).toBeNull();
  });
});
