import { UserFitnessProfile } from '../fitness-profile';
import { WeightEntry } from './weight-entry';
import { profileWeightChange } from './profile-weight';

const PROFILE: UserFitnessProfile = {
  primaryGoal: 'lose-fat',
  dateOfBirth: '1990-06-15',
  sex: 'male',
  height: { centimeters: 180 },
  weight: { kilograms: 82 },
  unitSystem: 'imperial',
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  trainingLocation: 'gym',
  equipment: ['full-gym', 'bench'],
  activityLevel: 'moderately-active',
  goalTarget: { targetWeight: { kilograms: 75 } },
  updatedAt: '2026-10-01T09:00:00.000Z',
};
const ENTRY: WeightEntry = {
  id: 'a',
  date: '2026-10-08',
  weight: { kilograms: 81.65 },
  createdAt: '2026-10-08T07:00:00.000Z',
  updatedAt: '2026-10-08T07:30:00.000Z',
};
const NOW = '2026-10-09T08:00:00.000Z';

describe('profileWeightChange', () => {
  it('replaces only the weight (canonical kilograms, unrounded) and the update time', () => {
    const result = profileWeightChange(PROFILE, ENTRY, NOW);
    expect(result).toEqual({ kind: 'change', profile: { ...PROFILE, weight: { kilograms: 81.65 }, updatedAt: NOW } });
  });

  it('keeps the stored kilograms exactly when the display unit is pounds (no round trip through lb)', () => {
    const result = profileWeightChange({ ...PROFILE, unitSystem: 'imperial' }, { ...ENTRY, weight: { kilograms: 81.66 } }, NOW);
    expect(result.kind === 'change' && result.profile.weight).toEqual({ kilograms: 81.66 });
  });

  it('the same canonical weight needs no change', () => {
    expect(profileWeightChange(PROFILE, { ...ENTRY, weight: { kilograms: 82 } }, NOW)).toEqual({ kind: 'same' });
  });

  it('an out-of-range weight or invalid date is never applied', () => {
    expect(profileWeightChange(PROFILE, { ...ENTRY, weight: { kilograms: 5 } }, NOW)).toEqual({ kind: 'invalid' });
    expect(profileWeightChange(PROFILE, { ...ENTRY, weight: { kilograms: Number.NaN } }, NOW)).toEqual({ kind: 'invalid' });
    expect(profileWeightChange(PROFILE, { ...ENTRY, date: '2026-02-30' }, NOW)).toEqual({ kind: 'invalid' });
  });

  it('leaves its inputs untouched', () => {
    const profile = structuredClone(PROFILE);
    const entry = structuredClone(ENTRY);
    profileWeightChange(profile, entry, NOW);
    expect(profile).toEqual(PROFILE);
    expect(entry).toEqual(ENTRY);
  });
});
