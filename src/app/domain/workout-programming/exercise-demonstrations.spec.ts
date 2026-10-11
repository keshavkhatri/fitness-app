import { EXERCISE_DEMONSTRATION_SOURCES, demonstrationFrames } from './exercise-demonstrations';
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
});
