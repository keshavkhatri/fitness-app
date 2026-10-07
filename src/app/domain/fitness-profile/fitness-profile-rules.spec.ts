import { PRIMARY_GOALS, UserFitnessProfile } from './fitness-profile.model';
import { hasApplicableGoalTargets, isTargetWeightDirectionValid, normalizeGoalTarget } from './goal-targets';
import { parseDateOfBirth, parseFitnessProfile } from './parse-fitness-profile';

const NOW = new Date(2026, 9, 7); // 7 Oct 2026, local time

const VALID_PROFILE: UserFitnessProfile = {
  primaryGoal: 'build-muscle',
  dateOfBirth: '1997-03-10',
  sex: 'male',
  height: { centimeters: 180 },
  weight: { kilograms: 75 },
  unitSystem: 'imperial',
  trainingExperience: 'beginner',
  trainingDaysPerWeek: 3,
  trainingLocation: 'home',
  equipment: ['dumbbells', 'bench'],
  activityLevel: 'sedentary',
  goalTarget: { targetWeight: { kilograms: 80 } },
  updatedAt: '2026-10-07T10:00:00.000Z',
};

describe('goal targets', () => {
  it('offers a target weight only for fat loss and muscle gain', () => {
    const withTargets = PRIMARY_GOALS.filter(hasApplicableGoalTargets);
    expect(withTargets).toEqual(['lose-fat', 'build-muscle']);
  });

  it('drops targets that do not apply to the goal', () => {
    const target = { targetWeight: { kilograms: 70 } };
    expect(normalizeGoalTarget('get-stronger', target)).toEqual({ targetWeight: null });
    expect(normalizeGoalTarget('lose-fat', target)).toBe(target);
  });

  it('checks the target direction for the goal', () => {
    const current = { kilograms: 80 };
    expect(isTargetWeightDirectionValid('lose-fat', { kilograms: 75 }, current)).toBe(true);
    expect(isTargetWeightDirectionValid('lose-fat', { kilograms: 85 }, current)).toBe(false);
    expect(isTargetWeightDirectionValid('build-muscle', { kilograms: 85 }, current)).toBe(true);
    expect(isTargetWeightDirectionValid('build-muscle', { kilograms: 80 }, current)).toBe(false);
  });
});

describe('parseFitnessProfile', () => {
  it('round-trips through JSON serialization unchanged', () => {
    const serialized = JSON.stringify(VALID_PROFILE);
    expect(JSON.parse(serialized).dateOfBirth).toBe('1997-03-10');
    expect(parseFitnessProfile(JSON.parse(serialized), NOW)).toEqual(VALID_PROFILE);
  });

  it('rejects legacy profiles that stored age instead of date of birth', () => {
    const legacy: Record<string, unknown> = { ...VALID_PROFILE, age: 29 };
    delete legacy['dateOfBirth'];
    expect(parseFitnessProfile(legacy, NOW)).toBeNull();
  });

  it.each([
    ['unknown goal', { primaryGoal: 'get-huge' }],
    ['non-ISO date of birth', { dateOfBirth: '10/03/1997' }],
    ['impossible date of birth', { dateOfBirth: '1997-02-30' }],
    ['numeric date of birth', { dateOfBirth: 858038400000 }],
    ['under-18 date of birth', { dateOfBirth: '2010-01-01' }],
    ['future date of birth', { dateOfBirth: '2030-01-01' }],
    ['impossible height', { height: { centimeters: 900 } }],
    ['missing weight', { weight: undefined }],
    ['unsupported training days', { trainingDaysPerWeek: 1 }],
    ['no equipment', { equipment: [] }],
    ['missing timestamp', { updatedAt: undefined }],
  ])('rejects %s', (_, change) => {
    expect(parseFitnessProfile({ ...VALID_PROFILE, ...change }, NOW)).toBeNull();
  });

  it('drops unknown equipment ids and inapplicable targets', () => {
    const parsed = parseFitnessProfile(
      { ...VALID_PROFILE, primaryGoal: 'get-stronger', equipment: ['dumbbells', 'jetpack', 'dumbbells'] },
      NOW,
    );
    expect(parsed?.equipment).toEqual(['dumbbells']);
    expect(parsed?.goalTarget).toEqual({ targetWeight: null });
  });

  it('rejects non-objects', () => {
    expect(parseFitnessProfile(null)).toBeNull();
    expect(parseFitnessProfile('profile')).toBeNull();
  });
});

describe('parseDateOfBirth', () => {
  it('accepts exactly 18 and rejects 17 (one day short)', () => {
    expect(parseDateOfBirth('2008-10-07', NOW)).toBe('2008-10-07');
    expect(parseDateOfBirth('2008-10-08', NOW)).toBeNull();
  });
});
