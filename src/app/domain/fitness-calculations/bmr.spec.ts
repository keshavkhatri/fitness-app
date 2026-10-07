import { estimateBmr, mifflinStJeor } from './bmr';

describe('BMR (Mifflin-St Jeor)', () => {
  const body = { weightKg: 80, heightCm: 180, ageYears: 30 };

  it('male: 10×kg + 6.25×cm − 5×age + 5', () => {
    // 800 + 1125 − 150 + 5
    expect(mifflinStJeor(body, 'male')).toBe(1780);
    expect(estimateBmr({ ...body, sex: 'male' })).toEqual({ kcal: 1780, method: 'mifflin-st-jeor', sexBasis: 'male' });
  });

  it('female: 10×kg + 6.25×cm − 5×age − 161', () => {
    // 600 + 1031.25 − 150 − 161
    const female = { weightKg: 60, heightCm: 165, ageYears: 30 };
    expect(mifflinStJeor(female, 'female')).toBe(1320.25);
    expect(estimateBmr({ ...female, sex: 'female' }).sexBasis).toBe('female');
  });

  it('prefer-not-to-say: exact midpoint of the male and female estimates', () => {
    const estimate = estimateBmr({ ...body, sex: 'prefer-not-to-say' });
    // male 1780, female 1614 → 1697
    expect(estimate.kcal).toBe((mifflinStJeor(body, 'male') + mifflinStJeor(body, 'female')) / 2);
    expect(estimate.kcal).toBe(1697);
    expect(estimate.sexBasis).toBe('sex-neutral-midpoint');
  });

  it('keeps decimal inputs precise (no intermediate rounding)', () => {
    // 725 + 1111.25 − 205 + 5
    expect(mifflinStJeor({ weightKg: 72.5, heightCm: 177.8, ageYears: 41 }, 'male')).toBeCloseTo(1636.25, 10);
    // 10×63.35 + 6.25×162.6 − 5×27 − 161 = 633.5 + 1016.25 − 135 − 161
    expect(mifflinStJeor({ weightKg: 63.35, heightCm: 162.6, ageYears: 27 }, 'female')).toBeCloseTo(1353.75, 10);
  });

  it('is deterministic', () => {
    const input = { weightKg: 91.7, heightCm: 183.4, ageYears: 52, sex: 'male' as const };
    expect(estimateBmr(input)).toEqual(estimateBmr(input));
  });
});
