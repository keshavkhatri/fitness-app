import { calculateFitnessAssessment, DEFAULT_CALCULATION_CONFIG } from '../fitness-calculations';
import { UserFitnessProfile } from '../fitness-profile';
import { createFoodEntry, inputOf, parseFoodEntry, updateFoodEntry, validateFoodEntryInput } from './food-entry';
import { balance, entriesBetween, entriesOn, groupByMeal, nutritionDay, recentFoods, sumNutrition } from './nutrition-day';
import { nutritionTargetsFrom } from './nutrition-targets';
import { FoodEntry, FoodEntryInput } from './nutrition.model';

const INPUT: FoodEntryInput = {
  name: '  Greek yogurt  ',
  quantity: 170,
  unit: 'g',
  meal: 'breakfast',
  calories: 100,
  proteinGrams: 17.3,
  carbohydrateGrams: 6,
  fatGrams: 0.7,
};
const NOW = '2026-10-08T07:30:00.000Z';

const entry = (overrides: Partial<FoodEntryInput> = {}, ctx: Partial<{ id: string; date: string; now: string }> = {}): FoodEntry => {
  const result = createFoodEntry({ ...INPUT, ...overrides }, { id: 'f1', date: '2026-10-08', now: NOW, ...ctx });
  if (!result.ok) {
    throw new Error(JSON.stringify(result.error));
  }
  return result.value;
};

describe('nutrition domain', () => {
  describe('food entries', () => {
    it('creates a snapshot entry from valid input (trimmed name, rounded values)', () => {
      expect(entry({ quantity: 150.456, calories: 99.96 })).toEqual({
        id: 'f1',
        date: '2026-10-08',
        meal: 'breakfast',
        name: 'Greek yogurt',
        quantity: 150.46,
        unit: 'g',
        nutrition: { calories: 100, proteinGrams: 17.3, carbohydrateGrams: 6, fatGrams: 0.7 },
        createdAt: NOW,
        updatedAt: NOW,
      });
    });

    it.each<[string, Partial<FoodEntryInput>, Record<string, string>]>([
      ['empty name', { name: '   ' }, { name: 'required' }],
      ['very long name', { name: 'x'.repeat(81) }, { name: 'too-long' }],
      ['missing quantity', { quantity: null }, { quantity: 'required' }],
      ['zero quantity', { quantity: 0 }, { quantity: 'not-positive' }],
      ['negative calories', { calories: -5 }, { calories: 'negative' }],
      ['missing protein', { proteinGrams: null }, { proteinGrams: 'required' }],
      ['infinite carbs', { carbohydrateGrams: Infinity }, { carbohydrateGrams: 'not-a-number' }],
      ['NaN fat', { fatGrams: Number.NaN }, { fatGrams: 'not-a-number' }],
      ['calorie typo (extra zeros)', { calories: 25_000 }, { calories: 'too-large' }],
      ['impossible grams', { proteinGrams: 1500 }, { proteinGrams: 'too-large' }],
      ['huge quantity', { quantity: 20_000 }, { quantity: 'too-large' }],
      ['unknown unit', { unit: 'cups' as never }, { unit: 'invalid-option' }],
      ['unknown meal', { meal: 'brunch' as never }, { meal: 'invalid-option' }],
    ])('rejects %s', (_, overrides, errors) => {
      expect(validateFoodEntryInput({ ...INPUT, ...overrides })).toEqual(errors);
      expect(createFoodEntry({ ...INPUT, ...overrides }, { id: 'x', date: '2026-10-08', now: NOW }).ok).toBe(false);
    });

    it('accepts zero for nutrition values (e.g. black coffee) and the upper bounds themselves', () => {
      expect(validateFoodEntryInput({ ...INPUT, calories: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0 })).toEqual({});
      expect(validateFoodEntryInput({ ...INPUT, calories: 10_000, quantity: 10_000, fatGrams: 1_000 })).toEqual({});
    });

    it('edits keep the id, date and creation time', () => {
      const original = entry();
      const edited = updateFoodEntry(original, { ...inputOf(original), name: 'Skyr', calories: 110, meal: 'snacks' }, '2026-10-08T12:00:00.000Z');
      expect(edited).toEqual({
        ok: true,
        value: { ...original, name: 'Skyr', meal: 'snacks', nutrition: { ...original.nutrition, calories: 110 }, updatedAt: '2026-10-08T12:00:00.000Z' },
      });
      expect(updateFoodEntry(original, { ...inputOf(original), quantity: -1 }, NOW).ok).toBe(false);
    });

    it('stored entries are parsed strictly and keep their recorded values', () => {
      const stored = JSON.parse(JSON.stringify(entry()));
      expect(parseFoodEntry(stored)).toEqual(entry());
      for (const broken of [
        { ...stored, id: '' },
        { ...stored, date: '2026-13-01' },
        { ...stored, unit: 'cup' },
        { ...stored, nutrition: { ...stored.nutrition, calories: -1 } },
        { ...stored, nutrition: { ...stored.nutrition, fatGrams: '3' } },
        { ...stored, createdAt: 'yesterday' },
        null,
        [],
        'food',
      ]) {
        expect(parseFoodEntry(broken)).toBeNull();
      }
    });
  });

  describe('daily totals', () => {
    const day = [
      entry({ calories: 100.1, proteinGrams: 0.1, carbohydrateGrams: 10, fatGrams: 0.2 }, { id: 'a' }),
      entry({ calories: 200.2, proteinGrams: 0.2, carbohydrateGrams: 20, fatGrams: 0.1, meal: 'lunch' }, { id: 'b', now: '2026-10-08T12:00:00.000Z' }),
      entry({ calories: 50, proteinGrams: 5, meal: 'snacks' }, { id: 'c', now: '2026-10-08T16:00:00.000Z' }),
    ];

    it('sums calories and macros exactly (no floating-point noise)', () => {
      expect(sumNutrition(day)).toEqual({ calories: 350.3, proteinGrams: 5.3, carbohydrateGrams: 36, fatGrams: 1 });
    });

    it('is deterministic regardless of entry order', () => {
      expect(sumNutrition([...day].reverse())).toEqual(sumNutrition(day));
      expect(nutritionDay([...day].reverse(), '2026-10-08')).toEqual(nutritionDay(day, '2026-10-08'));
    });

    it('groups by meal in day order, including empty meals with zero totals', () => {
      const groups = groupByMeal(day);
      expect(groups.map((g) => [g.meal, g.entries.map((e) => e.id), g.totals.calories])).toEqual([
        ['breakfast', ['a'], 100.1],
        ['lunch', ['b'], 200.2],
        ['dinner', [], 0],
        ['snacks', ['c'], 50],
      ]);
    });

    it('a day without entries has zero totals and four empty meals', () => {
      const empty = nutritionDay([], '2026-10-08');
      expect(empty.totals).toEqual({ calories: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0 });
      expect(empty.meals.every((m) => m.entries.length === 0)).toBe(true);
    });

    it('remaining and over target, never both', () => {
      expect(balance(2000, 1420)).toEqual({ target: 2000, consumed: 1420, remaining: 580, over: 0 });
      expect(balance(2000, 2120)).toEqual({ target: 2000, consumed: 2120, remaining: 0, over: 120 });
      expect(balance(140, 140)).toEqual({ target: 140, consumed: 140, remaining: 0, over: 0 });
      expect(balance(65, 64.9)).toMatchObject({ remaining: 0.1 });
    });
  });

  describe('dates (normalized local calendar dates)', () => {
    const lateNight = entry({}, { id: 'late', date: '2026-10-07', now: '2026-10-07T23:59:00.000Z' });
    const earlyMorning = entry({}, { id: 'early', date: '2026-10-08', now: '2026-10-08T00:01:00.000Z' });
    const nextWeek = entry({}, { id: 'next', date: '2026-10-15' });

    it('assigns entries to the local date they were logged for, never derived from the instant', () => {
      expect(entriesOn([lateNight, earlyMorning], '2026-10-07').map((e) => e.id)).toEqual(['late']);
      expect(entriesOn([lateNight, earlyMorning], '2026-10-08').map((e) => e.id)).toEqual(['early']);
      // An entry whose instant falls on the next UTC day still belongs to its recorded local date.
      const tz = entry({}, { id: 'tz', date: '2026-10-07', now: '2026-10-08T02:30:00.000Z' });
      expect(entriesOn([tz], '2026-10-07').map((e) => e.id)).toEqual(['tz']);
    });

    it('loads inclusive date ranges for future trends', () => {
      expect(entriesBetween([lateNight, earlyMorning, nextWeek], '2026-10-07', '2026-10-08').map((e) => e.id)).toEqual(['late', 'early']);
      expect(entriesBetween([lateNight, earlyMorning, nextWeek], '2026-10-09', '2026-10-31').map((e) => e.id)).toEqual(['next']);
    });
  });

  describe('targets from the fitness assessment', () => {
    const PROFILE: UserFitnessProfile = {
      primaryGoal: 'lose-fat',
      dateOfBirth: '1990-06-15',
      sex: 'male',
      height: { centimeters: 180 },
      weight: { kilograms: 82 },
      unitSystem: 'metric',
      trainingExperience: 'intermediate',
      trainingDaysPerWeek: 4,
      trainingLocation: 'gym',
      equipment: ['full-gym'],
      activityLevel: 'moderately-active',
      goalTarget: { targetWeight: null },
      updatedAt: '2026-10-01T09:00:00.000Z',
    };
    const assess = (profile: UserFitnessProfile) => {
      const r = calculateFitnessAssessment(profile, { asOfDate: '2026-10-08', config: DEFAULT_CALCULATION_CONFIG });
      if (!r.ok) {
        throw new Error(r.error.message);
      }
      return r.value;
    };

    it('uses the engine’s final calorie target and macro grams unchanged', () => {
      const assessment = assess(PROFILE);
      const targets = nutritionTargetsFrom(assessment);
      const macros = assessment.targets.macros;
      expect(targets.calories).toEqual({ kind: 'target', kcal: assessment.targets.calories.finalKcal, adjusted: false });
      expect(macros.status).not.toBe('infeasible');
      expect(targets.macros).toEqual(
        macros.status === 'infeasible'
          ? null
          : { kind: 'target', proteinGrams: macros.proteinGrams, carbohydrateGrams: macros.carbohydrateGrams, fatGrams: macros.fatGrams, constrained: macros.status === 'constrained' },
      );
    });

    it('withholds calorie and macro targets when the calorie target needs review', () => {
      const assessment = assess(PROFILE);
      const review = { ...assessment, targets: { ...assessment.targets, calories: { ...assessment.targets.calories, status: 'review-required' as const } } };
      expect(nutritionTargetsFrom(review)).toEqual({ calories: { kind: 'review-required' }, macros: { kind: 'withheld', reason: 'calorie-review' } });
    });

    it('withholds macro grams when infeasible, flags constrained and floor-applied targets', () => {
      const assessment = assess(PROFILE);
      const analysis = assessment.targets.macros.analysis;
      const infeasible = { ...assessment, targets: { ...assessment.targets, macros: { status: 'infeasible' as const, reason: 'protein-and-minimum-fat-exceed-calories' as const, analysis } } };
      expect(nutritionTargetsFrom(infeasible).macros).toEqual({ kind: 'withheld', reason: 'infeasible' });
      const constrained = {
        ...assessment,
        targets: {
          calories: { ...assessment.targets.calories, status: 'floor-applied' as const },
          macros: { status: 'constrained' as const, constraint: 'fat-reduced-toward-minimum' as const, proteinGrams: 150, fatGrams: 40, carbohydrateGrams: 120, analysis },
        },
      };
      const t = nutritionTargetsFrom(constrained);
      expect(t.calories).toMatchObject({ kind: 'target', adjusted: true });
      expect(t.macros).toEqual({ kind: 'target', proteinGrams: 150, carbohydrateGrams: 120, fatGrams: 40, constrained: true });
    });
  });

  describe('recent foods', () => {
    it('lists each distinct food once (name ignoring case and spacing, amount, unit), newest first', () => {
      const older = entry({ name: 'Greek yogurt' }, { id: 'a', date: '2026-10-06' });
      const newer = entry({ name: ' greek  YOGURT ' }, { id: 'b', date: '2026-10-08' });
      const bigger = entry({ name: 'Greek yogurt', quantity: 340 }, { id: 'c', date: '2026-10-07' });
      const oats = entry({ name: 'Oats' }, { id: 'd', date: '2026-10-05' });
      expect(recentFoods([older, oats, newer, bigger]).map((e) => e.id)).toEqual(['b', 'c', 'd']);
      expect(recentFoods([older, oats, newer, bigger], 2).map((e) => e.id)).toEqual(['b', 'c']);
    });
  });
});
