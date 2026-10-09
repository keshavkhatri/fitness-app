import { UserFitnessProfile } from '../fitness-profile';
import { DEFAULT_WORKOUT_CONFIG, WORKOUT_EQUIPMENT, generateWorkoutPlan } from '../workout-programming';
import { generateWorkoutPlanForProfile, planFreshness } from './training-plan';

const PROFILE: UserFitnessProfile = {
  primaryGoal: 'build-muscle',
  dateOfBirth: '1990-06-15',
  sex: 'male',
  height: { centimeters: 180 },
  weight: { kilograms: 80 },
  unitSystem: 'metric',
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  trainingLocation: 'gym',
  equipment: ['full-gym'],
  activityLevel: 'moderately-active',
  goalTarget: { targetWeight: null },
  updatedAt: '2026-10-01T09:00:00.000Z',
};

const planFor = (profile: UserFitnessProfile, generatedAt = '2026-10-08') => {
  const result = generateWorkoutPlanForProfile(profile, { generatedAt });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};

describe('training plan', () => {
  describe('generateWorkoutPlanForProfile', () => {
    it('maps the profile and generates the same plan as the engine directly, with mapping assumptions', () => {
      const plan = planFor(PROFILE);
      const direct = generateWorkoutPlan(
        { goal: 'build-muscle', experience: 'intermediate', daysPerWeek: 4, locations: ['gym'], equipment: [...WORKOUT_EQUIPMENT] },
        { generatedAt: '2026-10-08', assumptions: ['full-gym-includes-all-equipment'] },
      );
      expect(direct.ok && plan).toEqual(direct.ok ? direct.value : null);
      expect(plan.workoutProgrammingVersion).toBe('v2');
      expect(plan.assumptions).toContain('full-gym-includes-all-equipment');
    });

    it('is deterministic: same profile → same plan id (the date is not identity)', () => {
      expect(planFor(PROFILE).id).toBe(planFor({ ...PROFILE, updatedAt: '2027-01-01T00:00:00.000Z' }, '2027-01-01').id);
    });

    it('records combined-location and unknown-equipment assumptions', () => {
      const plan = planFor({ ...PROFILE, trainingLocation: 'both', equipment: ['dumbbells', 'bench', 'other'] });
      expect(plan.assumptions).toEqual(expect.arrayContaining(['combined-gym-and-home-equipment', 'unrecognized-equipment-ignored']));
      expect(plan.explanation.availability.locations).toEqual(['gym', 'home']);
    });

    it('passes a custom configuration through', () => {
      const result = generateWorkoutPlanForProfile(PROFILE, { generatedAt: '2026-10-08', config: { ...DEFAULT_WORKOUT_CONFIG, version: 'v9' as never } });
      expect(result.ok ? null : result.error.code).toBe('invalid-configuration');
    });

    it('returns the engine’s typed error for an unsupported frequency', () => {
      const result = generateWorkoutPlanForProfile({ ...PROFILE, trainingDaysPerWeek: 7 as never }, { generatedAt: '2026-10-08' });
      expect(result.ok ? null : result.error.code).toBe('invalid-frequency');
    });
  });

  describe('planFreshness', () => {
    const plan = planFor(PROFILE);

    it('a plan is current for the profile it was generated from', () => {
      expect(planFreshness(plan, PROFILE)).toBe('current');
    });

    it.each<[string, Partial<UserFitnessProfile>]>([
      ['body weight', { weight: { kilograms: 76 } }],
      ['activity level', { activityLevel: 'very-active' }],
      ['units', { unitSystem: 'imperial' }],
      ['date of birth', { dateOfBirth: '1991-01-01' }],
      ['profile timestamp', { updatedAt: '2026-12-01T00:00:00.000Z' }],
      ['equipment that maps to the same engine equipment', { equipment: ['full-gym', 'dumbbells'] }],
    ])('stays current when only %s changes', (_, change) => {
      expect(planFreshness(plan, { ...PROFILE, ...change })).toBe('current');
    });

    it.each<[string, Partial<UserFitnessProfile>]>([
      ['goal', { primaryGoal: 'get-stronger' }],
      ['experience', { trainingExperience: 'advanced' }],
      ['training days', { trainingDaysPerWeek: 3 }],
      ['location', { trainingLocation: 'both' }],
      ['equipment', { equipment: ['dumbbells'] }],
      ['an unsupported frequency', { trainingDaysPerWeek: 7 as never }],
    ])('is stale when %s changes', (_, change) => {
      expect(planFreshness(plan, { ...PROFILE, ...change })).toBe('profile-changed');
    });

    it('is stale when only a mapping assumption changes (e.g. "other" equipment added)', () => {
      const home = { ...PROFILE, trainingLocation: 'home' as const, equipment: ['dumbbells' as const] };
      const homePlan = planFor(home);
      expect(planFreshness(homePlan, home)).toBe('current');
      expect(planFreshness(homePlan, { ...home, equipment: ['dumbbells', 'other'] })).toBe('profile-changed');
    });
  });
});
