import { WeightEntry } from '../body-measurements';
import { calculateFitnessAssessment } from '../fitness-calculations';
import { IsoCalendarDate, UserFitnessProfile, calendarDateOf, parseIsoCalendarDate, toIsoCalendarDate } from '../fitness-profile';
import { FoodEntry, createFoodEntry } from '../nutrition';
import { addDays } from '../workout-session';
import { CheckInInput, DEFAULT_CHECK_IN_CONFIG, calorieCheckIn, checkInPeriod } from './calorie-check-in';

// Synthetic data only. "Today" is Thursday 29 October 2026; the period is 1–28 October.
const TODAY = '2026-10-29';
const localDateOf = (instant: string) => calendarDateOf(new Date(instant));
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
const assess = (profile: UserFitnessProfile) => {
  const r = calculateFitnessAssessment(profile, { asOfDate: TODAY });
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
};

const day = (n: number): IsoCalendarDate => toIsoCalendarDate(addDays(parseIsoCalendarDate('2026-10-01')!, n))!;
let seq = 0;
const food = (date: IsoCalendarDate, calories: number): FoodEntry => {
  const r = createFoodEntry(
    { name: 'Meal', quantity: 1, unit: 'serving', meal: 'lunch', calories, proteinGrams: 30, carbohydrateGrams: 50, fatGrams: 20 },
    { id: `f${++seq}`, date, now: `${date}T12:00:00.000Z` },
  );
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
};
const weigh = (date: IsoCalendarDate, kilograms: number, at = '07'): WeightEntry => ({
  id: `w-${date}-${at}`,
  date,
  weight: { kilograms },
  createdAt: `${date}T${at}:00:00.000Z`,
  updatedAt: `${date}T${at}:00:00.000Z`,
});

/** One entry of `kcal` on each of days 0–27 (1–28 Oct) that `logged` accepts. */
const meals = (kcal: number, logged: (n: number) => boolean = () => true) =>
  Array.from({ length: 28 }, (_, n) => n).filter(logged).map((n) => food(day(n), kcal));
/** A weigh-in every `every` days on a straight line (kg/week), optionally with ± noise alternating. */
const scale = (start: number, kgPerWeek: number, every = 2, noise = 0) =>
  Array.from({ length: Math.floor(27 / every) + 1 }, (_, i) => i * every).map((n, i) =>
    weigh(day(n), Math.round((start + (kgPerWeek / 7) * n + (i % 2 ? noise : -noise)) * 100) / 100),
  );

const run = (overrides: Partial<CheckInInput> = {}) => calorieCheckIn({ today: TODAY, localDateOf, profile: PROFILE, foods: meals(2000), weights: scale(84, -0.5), ...overrides })!;

describe('Calorie Check-in', () => {
  describe('analysis period', () => {
    it('is the 28 days ending yesterday (today’s log is usually incomplete)', () => {
      expect(checkInPeriod(TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-28', days: 28 });
      expect(checkInPeriod('2026-03-01')).toEqual({ from: '2026-02-01', to: '2026-02-28', days: 28 });
      expect(checkInPeriod('2026-02-30')).toBeNull();
    });

    it('ignores food and weigh-ins outside the period, including today and future dates', () => {
      const c = run({
        foods: [...meals(2000), food('2026-09-30', 9000), food(TODAY, 9000), food('2026-11-02', 9000)],
        weights: [...scale(84, -0.5), weigh('2026-09-30', 60), weigh(TODAY, 60), weigh('2026-11-02', 60)],
      });
      expect(c.intake).toEqual({ loggedDays: 28, firstHalfLoggedDays: 14, secondHalfLoggedDays: 14, averageKcal: 2000 });
      expect(c.weight).toMatchObject({ weighIns: 14, weighInDays: 14, spanDays: 26, first: { date: '2026-10-01' }, last: { date: '2026-10-27' }, kgPerWeek: -0.5 });
    });
  });

  describe('maintenance estimate', () => {
    it('average logged intake minus the energy implied by the weight trend, with a range', () => {
      const c = run();
      // −0.5 kg/week × 7,700 kcal/kg ÷ 7 = −550 kcal/day, so maintenance ≈ 2,000 + 550.
      expect(c.maintenance).toEqual({ kind: 'estimate', kcal: 2550, low: 2400, high: 2700, balanceKcal: -550 });
      expect(c.trend).toBe('losing');
      expect(c.onTrack).toBe(true);
    });

    it('noisy weigh-ins widen the range instead of moving the estimate', () => {
      const clean = run();
      const noisy = run({ weights: scale(84, -0.5, 2, 0.3) });
      if (clean.maintenance.kind !== 'estimate' || noisy.maintenance.kind !== 'estimate') {
        throw new Error('expected estimates');
      }
      expect(Math.abs(noisy.maintenance.kcal - clean.maintenance.kcal)).toBeLessThanOrEqual(100);
      expect(noisy.maintenance.high - noisy.maintenance.kcal).toBeGreaterThan(clean.maintenance.high - clean.maintenance.kcal);
    });

    it('missing food days are not zero: the average uses logged days only', () => {
      const c = run({ foods: meals(2200, (n) => n % 4 !== 3) }); // 21 of 28 days logged
      expect(c.intake).toMatchObject({ loggedDays: 21, averageKcal: 2200 });
      expect(c.maintenance).toMatchObject({ kind: 'estimate', kcal: 2750 });
    });

    it('same-day weigh-ins are each kept; distinct days are counted for the minimum', () => {
      const weights = [...scale(84, -0.5), weigh(day(0), 84.4, '20')];
      const c = run({ weights });
      expect(c.weight).toMatchObject({ weighIns: 15, weighInDays: 14 });
    });

    it.each([
      ['too few logged days', { foods: meals(2000, (n) => n < 13) }, ['logged-days', 'logging-spread']],
      ['logging only in the first half', { foods: meals(2000, (n) => n < 15) }, ['logging-spread']],
      ['too few weigh-ins', { weights: [weigh(day(0), 84), weigh(day(20), 83), weigh(day(27), 82.5)] }, ['weigh-ins']],
      ['weigh-ins over less than two weeks', { weights: scale(84, -0.5).filter((w) => w.date >= day(14)) }, ['weight-span']],
      ['no data at all', { foods: [], weights: [] }, ['logged-days', 'logging-spread', 'weigh-ins', 'weight-span']],
    ])('insufficient data (%s): says what is missing and estimates nothing', (_, overrides, missing) => {
      const c = run(overrides as Partial<CheckInInput>);
      expect(c.maintenance).toEqual({ kind: 'insufficient', missing });
      expect(c.trend).toBeNull();
      expect(c.recommendation).toEqual({ kind: 'none', reason: 'insufficient-data' });
    });

    it('an estimate below BMR is implausible (food logs probably incomplete): no maintenance, no proposal', () => {
      const c = run({ foods: meals(900), weights: scale(84, 0) });
      const bmr = assess(PROFILE).estimates.bmrKcal;
      expect(bmr).toBeGreaterThan(900);
      expect(c.maintenance).toEqual({ kind: 'implausible', reason: 'below-bmr', kcal: 900 });
      expect(c.recommendation).toEqual({ kind: 'none', reason: 'implausible' });
    });

    it('BMR is never used as maintenance: the target comes from the maintenance basis', () => {
      const c = run();
      const a = assess(PROFILE);
      expect(c.current).toMatchObject({ kind: 'ready', bmrKcal: a.estimates.bmrKcal, maintenanceKcal: a.estimates.tdeeKcal, maintenanceSource: 'formula' });
      if (c.current.kind !== 'ready') {
        throw new Error('ready');
      }
      expect(c.current.maintenanceKcal).toBeGreaterThan(c.current.bmrKcal);
    });
  });

  describe('recommendation', () => {
    it('keeps the target when the current maintenance basis is inside the estimated range', () => {
      const tdee = assess(PROFILE).estimates.tdeeKcal;
      // Intake that, with a −0.5 kg/week trend, implies maintenance ≈ the formula's.
      const c = run({ foods: meals(tdee - 550) });
      expect(c.recommendation).toEqual({ kind: 'keep', reason: 'consistent', nextCheckInOn: null });
    });

    it('proposes a capped step towards the observed maintenance, recalculated by the engine', () => {
      const a = assess(PROFILE);
      const c = run({ foods: meals(a.estimates.tdeeKcal - 550 - 600) }); // observed maintenance 600 below the formula's
      expect(c.recommendation).toMatchObject({ kind: 'adjust', maintenanceKcal: a.estimates.tdeeKcal - 250, limited: true });
      if (c.recommendation.kind !== 'adjust') {
        throw new Error('adjust');
      }
      const expected = assess({ ...PROFILE, energyCalibration: { maintenanceKcal: a.estimates.tdeeKcal - 250, observedFrom: '2026-10-01', observedTo: '2026-10-28', acceptedAt: '2026-10-29T09:00:00.000Z' } });
      expect(c.recommendation.targetKcal).toBe(expected.targets.calories.finalKcal);
      expect(c.recommendation.changeKcal).toBe(expected.targets.calories.finalKcal - a.targets.calories.finalKcal);
      expect(c.recommendation.changeKcal).toBeLessThan(0);
      expect(c.recommendation.macros).toEqual(expected.targets.macros);
    });

    it('an uncapped step lands on the estimate', () => {
      const a = assess(PROFILE);
      const c = run({ foods: meals(a.estimates.tdeeKcal - 550 + 200) });
      if (c.recommendation.kind !== 'adjust' || c.maintenance.kind !== 'estimate') {
        throw new Error('adjust');
      }
      expect(c.recommendation).toMatchObject({ maintenanceKcal: c.maintenance.kcal, limited: false });
      expect(c.recommendation.changeKcal).toBeGreaterThan(0);
    });

    it('too uncertain (noisy weigh-ins): shows the estimate but proposes nothing, even far from the target', () => {
      const a = assess(PROFILE);
      const c = run({ foods: meals(a.estimates.tdeeKcal - 550 - 600), weights: scale(84, -0.5, 2, 0.6) });
      expect(c.maintenance).toMatchObject({ kind: 'estimate' });
      if (c.maintenance.kind !== 'estimate') {
        throw new Error('estimate');
      }
      expect(c.maintenance.high - c.maintenance.kcal).toBeGreaterThan(DEFAULT_CHECK_IN_CONFIG.maxRangeForAdviceKcal);
      expect(c.recommendation).toEqual({ kind: 'keep', reason: 'too-uncertain', nextCheckInOn: null });
    });

    it('very irregular weigh-ins give no estimate at all', () => {
      const c = run({ weights: scale(84, -0.5, 4, 1) });
      expect(c.maintenance).toEqual({ kind: 'insufficient', missing: ['weight-noise'] });
      expect(c.recommendation).toEqual({ kind: 'none', reason: 'insufficient-data' });
    });

    it('right after an accepted adjustment, waits before proposing another', () => {
      const a = assess(PROFILE);
      const calibrated = { ...PROFILE, energyCalibration: { maintenanceKcal: 3000, observedFrom: '2026-09-20', observedTo: '2026-10-17', acceptedAt: '2026-10-20T09:00:00.000Z' } };
      const c = run({ profile: calibrated, foods: meals(a.estimates.tdeeKcal - 1000) });
      expect(c.current).toMatchObject({ kind: 'ready', maintenanceKcal: 3000, maintenanceSource: 'check-in', acceptedAt: '2026-10-20T09:00:00.000Z' });
      expect(c.recommendation).toEqual({ kind: 'keep', reason: 'recently-adjusted', nextCheckInOn: '2026-11-03' });
      expect(run({ profile: calibrated, today: '2026-11-03', foods: meals(a.estimates.tdeeKcal - 1000) }).recommendation.kind).not.toBe('keep');
    });

    it('the product safety threshold is respected: no proposal it would block', () => {
      // Small, sedentary profile: the target already sits on the safety threshold.
      const small: UserFitnessProfile = { ...PROFILE, sex: 'female', height: { centimeters: 160 }, weight: { kilograms: 55 }, activityLevel: 'sedentary', dateOfBirth: '1976-01-01' };
      const a = assess(small);
      expect(a.targets.calories).toMatchObject({ status: 'floor-applied', finalKcal: 1200 });
      const c = run({ profile: small, foods: meals(a.estimates.tdeeKcal - 550 - 200), weights: scale(55, -0.5) });
      expect(c.maintenance.kind).toBe('estimate');
      expect(c.recommendation).toEqual({ kind: 'keep', reason: 'safety-threshold', nextCheckInOn: null });
    });

    it('no profile, unreadable profile or a withheld target: the estimate stays, nothing is proposed', () => {
      expect(run({ profile: null })).toMatchObject({ current: { kind: 'no-profile' }, maintenance: { kind: 'estimate' }, onTrack: null, intakeVsTargetKcal: null, recommendation: { kind: 'none', reason: 'no-target' } });
      expect(run({ profile: 'unavailable' }).recommendation).toEqual({ kind: 'none', reason: 'no-target' });
      const review: UserFitnessProfile = { ...PROFILE, primaryGoal: 'lose-fat', sex: 'female', dateOfBirth: '1956-06-15', height: { centimeters: 150 }, weight: { kilograms: 45 }, activityLevel: 'sedentary' };
      expect(assess(review).targets.calories.status).toBe('review-required');
      expect(run({ profile: review, foods: meals(1200), weights: scale(45, -0.5) })).toMatchObject({ current: { kind: 'review-required' }, recommendation: { kind: 'none', reason: 'no-target' } });
    });

    it('reports intake against the current target and whether the trend fits the goal', () => {
      const a = assess(PROFILE);
      const gaining = run({ weights: scale(84, 0.4) });
      expect(gaining.trend).toBe('gaining');
      expect(gaining.onTrack).toBe(false);
      expect(gaining.intakeVsTargetKcal).toBe(2000 - a.targets.calories.finalKcal);
      expect(run({ weights: scale(84, 0.05) }).trend).toBe('stable');
    });
  });

  it('is deterministic and never changes its inputs', () => {
    const foods = meals(2000);
    const weights = scale(84, -0.5);
    const before = JSON.stringify([PROFILE, foods, weights]);
    expect(calorieCheckIn({ today: TODAY, localDateOf, profile: PROFILE, foods, weights })).toEqual(calorieCheckIn({ today: TODAY, localDateOf, profile: PROFILE, foods, weights }));
    expect(JSON.stringify([PROFILE, foods, weights])).toBe(before);
    expect(DEFAULT_CHECK_IN_CONFIG.windowDays).toBe(28);
  });
});
