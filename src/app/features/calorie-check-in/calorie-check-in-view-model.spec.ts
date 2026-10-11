import { WeightEntry } from '../../domain/body-measurements';
import { calorieCheckIn } from '../../domain/calorie-check-in';
import { UserFitnessProfile, calendarDateOf } from '../../domain/fitness-profile';
import { FoodEntry, createFoodEntry } from '../../domain/nutrition';
import { toCheckInScreen } from './calorie-check-in-view-model';

// Synthetic data only. "Today" is 29 October 2026; the period is 1–28 October.
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
const date = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10);
let seq = 0;
const food = (d: string, calories: number): FoodEntry => {
  const r = createFoodEntry({ name: 'Meal', quantity: 1, unit: 'serving', meal: 'lunch', calories, proteinGrams: 30, carbohydrateGrams: 50, fatGrams: 20 }, { id: `f${++seq}`, date: d, now: `${d}T12:00:00.000Z` });
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
};
const meals = (kcal: number) => Array.from({ length: 28 }, (_, n) => food(date(n), kcal));
const scale = (kgPerWeek: number, every = 2, noise = 0): WeightEntry[] =>
  Array.from({ length: Math.floor(27 / every) + 1 }, (_, i) => i * every).map((n, i) => {
    const d = date(n);
    return { id: `w-${d}`, date: d, weight: { kilograms: Math.round((84 + (kgPerWeek / 7) * n + (i % 2 ? noise : -noise)) * 100) / 100 }, createdAt: `${d}T07:00:00.000Z`, updatedAt: `${d}T07:00:00.000Z` };
  });

const screen = (options: { profile?: UserFitnessProfile; foods?: FoodEntry[]; weights?: WeightEntry[] } = {}) => {
  const profile = options.profile ?? PROFILE;
  const checkIn = calorieCheckIn({ today: '2026-10-29', localDateOf: (i) => calendarDateOf(new Date(i)), profile, foods: options.foods ?? meals(2000), weights: options.weights ?? scale(-0.5) })!;
  return toCheckInScreen({ today: '2026-10-29', unitSystem: profile.unitSystem, checkIn });
};

describe('Calorie Check-in view model', () => {
  it('imperial: weights and the weekly trend in lb', () => {
    const s = screen({ profile: { ...PROFILE, unitSystem: 'imperial' } });
    expect(s.observed.find((r) => r.key === 'weight')).toMatchObject({ value: '−1.1 lb a week', detail: '14 weigh-ins: 185.2 lb on Oct 1 → 181.1 lb on Oct 27' });
  });

  it('logged intake below what the body uses at rest: explained, no estimate', () => {
    const s = screen({ foods: meals(900), weights: scale(0) });
    expect(s.estimate).toMatchObject({ kind: 'implausible' });
    expect(s.estimate.kind === 'implausible' && s.estimate.message).toMatch(/usually means some food wasn’t logged/);
    expect(s.recommendation).toMatchObject({ kind: 'none', message: 'No change is suggested from data that doesn’t add up.', proposal: null });
  });

  it('too uncertain: the range is shown and no change is proposed', () => {
    const s = screen({ foods: meals(1625), weights: scale(-0.5, 2, 0.6) });
    expect(s.estimate.kind).toBe('estimate');
    expect(s.recommendation).toMatchObject({ kind: 'keep', proposal: null });
    expect(s.recommendation.message).toMatch(/range is too wide to justify a change/);
  });

  it('irregular weigh-ins: explains why there is no estimate and links to the weight history', () => {
    const s = screen({ weights: scale(-0.5, 4, 1) });
    expect(s.estimate).toEqual({ kind: 'insufficient', items: [{ key: 'weight-noise', text: expect.stringMatching(/vary too much/), link: 'weight-history' }] });
  });

  it('a proposal carries exactly the confirmed values and the recalculated macros', () => {
    const s = screen({ foods: meals(1625) });
    expect(s.recommendation.kind).toBe('adjust');
    const p = s.recommendation.proposal!;
    expect(p.confirm.maintenanceKcal).toBeGreaterThan(0);
    expect(p.next).toBe(`${new Intl.NumberFormat('en-US').format(p.confirm.targetKcal)} kcal a day`);
    expect(p.macros?.map((m) => m.key)).toEqual(['protein', 'carbohydrate', 'fat']);
  });
});
