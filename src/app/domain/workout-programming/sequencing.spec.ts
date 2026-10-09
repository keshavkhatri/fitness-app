import { EXERCISE_LIBRARY } from './exercise-library';
import { Exercise } from './exercise.model';
import { sequenceCategoryFor } from './sequencing';
import { ObjectiveRole, SequenceCategory } from './workout-taxonomy';

const byId = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e]));
const ex = (id: string) => byId.get(id) as Exercise;

describe('sequenceCategoryFor', () => {
  it.each<[string, ObjectiveRole, SequenceCategory]>([
    ['back-squat', 'primary', 'primary-compound'],
    ['bodyweight-squat', 'primary', 'primary-compound'],
    ['romanian-deadlift', 'secondary', 'secondary-compound'],
    ['bulgarian-split-squat', 'secondary', 'other-compound'],
    ['leg-press', 'accessory', 'other-compound'],
    ['leg-curl', 'accessory', 'isolation'],
    ['dumbbell-lateral-raise', 'accessory', 'isolation'],
    ['barbell-curl', 'accessory', 'arms'],
    ['diamond-push-up', 'accessory', 'arms'],
    ['triceps-pushdown', 'accessory', 'arms'],
    ['plank', 'core', 'core'],
    ['farmers-carry', 'core', 'core'],
    ['burpees', 'conditioning', 'conditioning'],
  ])('%s as %s → %s', (id, role, category) => {
    expect(sequenceCategoryFor(ex(id), role)).toBe(category);
  });

  it('uses the role, not the exercise id or name', () => {
    expect(sequenceCategoryFor(ex('push-up'), 'primary')).toBe('primary-compound');
    expect(sequenceCategoryFor(ex('push-up'), 'secondary')).toBe('secondary-compound');
    expect(sequenceCategoryFor(ex('push-up'), 'accessory')).toBe('other-compound');
  });
});
