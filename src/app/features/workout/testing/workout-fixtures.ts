import { UserFitnessProfile } from '../../../domain/fitness-profile';
import { generateWorkoutPlanForProfile } from '../../../domain/training-plan';
import { WorkoutPlan } from '../../../domain/workout-programming';

/** Thursday 8 October 2026, 09:00 local time. */
export const THURSDAY = new Date(2026, 9, 8, 9, 0);
export const MONDAY = new Date(2026, 9, 5, 9, 0);
export const SATURDAY = new Date(2026, 9, 10, 9, 0);
export const SUNDAY = new Date(2026, 9, 11, 9, 0);

export const PROFILE: UserFitnessProfile = {
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

export const profileWith = (overrides: Partial<UserFitnessProfile>): UserFitnessProfile => ({ ...PROFILE, ...overrides });

/** Beginner, 5 days: full body / light activity alternating, Monday to Friday. */
export const ACTIVITY_PROFILE = profileWith({ trainingExperience: 'beginner', trainingDaysPerWeek: 5 });
/** 3 days (Mon/Wed/Fri): Thursday is a rest day. */
export const REST_PROFILE = profileWith({ trainingDaysPerWeek: 3 });
/** Bodyweight only at home: pulling is a flagged substitute. */
export const HOME_PROFILE = profileWith({
  primaryGoal: 'lose-fat',
  trainingExperience: 'beginner',
  trainingDaysPerWeek: 3,
  trainingLocation: 'home',
  equipment: ['bodyweight-only'],
});

export function planFor(profile: UserFitnessProfile = PROFILE): WorkoutPlan {
  const result = generateWorkoutPlanForProfile(profile, { generatedAt: '2026-10-08' });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}
