import { EXERCISE_ARTWORK, EXERCISE_DEMONSTRATION_SOURCES, demonstrationFrames, exerciseArtwork } from './exercise-demonstrations';
import { EXERCISE_LIBRARY } from './exercise-library';

describe('exercise demonstrations', () => {
  it('only names catalog exercises, each with its own source entry', () => {
    const ids = new Set(EXERCISE_LIBRARY.map((e) => e.id));
    expect(Object.keys(EXERCISE_DEMONSTRATION_SOURCES).filter((id) => !ids.has(id))).toEqual([]);
    const sources = Object.values(EXERCISE_DEMONSTRATION_SOURCES);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it('gives the start and end frames, or null without a faithful match', () => {
    expect(demonstrationFrames('push-up')).toEqual(['Pushups/0.jpg', 'Pushups/1.jpg']);
    expect(demonstrationFrames('burpees')).toBeNull();
    expect(demonstrationFrames('toString')).toBeNull();
  });

  it('binds artwork only to catalog exercises, one file each', () => {
    const ids = new Set(EXERCISE_LIBRARY.map((e) => e.id));
    expect(Object.keys(EXERCISE_ARTWORK).filter((id) => !ids.has(id))).toEqual([]);
    expect(new Set(Object.values(EXERCISE_ARTWORK)).size).toBe(Object.keys(EXERCISE_ARTWORK).length);
    for (const [id, file] of Object.entries(EXERCISE_ARTWORK)) {
      expect(file).toBe(`${id}-guide.webp`);
    }
    expect(EXERCISE_ARTWORK['dumbbell-lateral-raise']).toBe('dumbbell-lateral-raise-guide.webp');
    expect(EXERCISE_ARTWORK['back-squat']).toBe('back-squat-guide.webp');
    expect(exerciseArtwork('lat-pulldown')).toBe('lat-pulldown-guide.webp');
    expect(exerciseArtwork('not-an-exercise')).toBeNull();
    expect(exerciseArtwork('toString')).toBeNull();
  });
});
