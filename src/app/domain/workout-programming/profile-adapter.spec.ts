import { UserFitnessProfile } from '../fitness-profile';
import { generateWorkoutPlan } from './generate-workout-plan';
import { workoutInputFromProfile } from './profile-adapter';
import { WORKOUT_EQUIPMENT } from './workout-taxonomy';

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

describe('workoutInputFromProfile', () => {
  it('maps only the fields that influence programming', () => {
    const result = workoutInputFromProfile(PROFILE);
    expect(result).toEqual({
      ok: true,
      value: {
        input: {
          goal: 'build-muscle',
          experience: 'intermediate',
          daysPerWeek: 4,
          locations: ['gym'],
          equipment: [...WORKOUT_EQUIPMENT],
        },
        assumptions: ['full-gym-includes-all-equipment'],
      },
    });
  });

  it('maps home equipment and bodyweight-only', () => {
    const home = workoutInputFromProfile({ ...PROFILE, trainingLocation: 'home', equipment: ['dumbbells', 'bench', 'resistance-bands'] });
    expect(home.ok && home.value.input).toMatchObject({ locations: ['home'], equipment: ['dumbbells', 'bench', 'resistance-band'] });

    const bodyweight = workoutInputFromProfile({ ...PROFILE, trainingLocation: 'home', equipment: ['bodyweight-only'] });
    expect(bodyweight.ok && bodyweight.value.input.equipment).toEqual([]);
  });

  it('treats "both" as combined gym + home and records the assumption', () => {
    const result = workoutInputFromProfile({ ...PROFILE, trainingLocation: 'both', equipment: ['dumbbells', 'machines'] });
    expect(result.ok && result.value.input.locations).toEqual(['gym', 'home']);
    expect(result.ok && result.value.assumptions).toContain('combined-gym-and-home-equipment');
  });

  it('ignores "other" equipment with an assumption', () => {
    const result = workoutInputFromProfile({ ...PROFILE, trainingLocation: 'home', equipment: ['other'] });
    expect(result.ok && result.value.input.equipment).toEqual([]);
    expect(result.ok && result.value.assumptions).toContain('unrecognized-equipment-ignored');
  });

  it('still guards against out-of-range frequencies at runtime', () => {
    // Onboarding no longer offers 7; this protects against unvalidated data.
    const result = workoutInputFromProfile({ ...PROFILE, trainingDaysPerWeek: 7 as never });
    expect(result.ok ? null : result.error.code).toBe('invalid-frequency');
  });

  it('feeds the generator end to end, carrying assumptions onto the plan', () => {
    const mapped = workoutInputFromProfile({ ...PROFILE, trainingLocation: 'both', equipment: ['dumbbells', 'bench', 'other'] });
    if (!mapped.ok) {
      throw new Error(mapped.error.message);
    }
    const plan = generateWorkoutPlan(mapped.value.input, { generatedAt: '2026-10-07', assumptions: mapped.value.assumptions });
    expect(plan.ok && plan.value.assumptions).toEqual([
      'bodyweight-always-available',
      'no-starting-loads',
      'day-order-not-weekday-schedule',
      'combined-gym-and-home-equipment',
      'unrecognized-equipment-ignored',
    ]);
  });
});
