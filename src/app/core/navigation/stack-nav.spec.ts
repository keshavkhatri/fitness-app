import { FOOD_PAGES, WORKOUT_DETAIL, YOU_SECTIONS, inStack } from './stack-nav';

describe('inStack (the body sections opened from another tab stay in it)', () => {
  it('moves the shared sections and You itself into the given stack', () => {
    expect(inStack('/you/weight-history', '/progress')).toBe('/progress/weight-history');
    expect(inStack('/you/body-composition/abc/edit', '/progress')).toBe('/progress/body-composition/abc/edit');
    expect(inStack(['/you', 'measurements', 'new'], '/progress')).toEqual(['/progress', 'measurements', 'new']);
    expect(inStack('/you', '/progress')).toBe('/progress');
  });

  it('leaves everything else alone', () => {
    expect(inStack('/you/settings', '/progress')).toBe('/you/settings');
    expect(inStack(['/you', 'settings'], '/progress')).toEqual(['/you', 'settings']);
    expect(inStack('/workout', '/progress')).toBe('/workout');
    expect(inStack('/you/weight-historyX', '/progress')).toBe('/you/weight-historyX');
  });
});

describe('inStack (Home: the pages its cards open stay in the Home tab)', () => {
  const home = [YOU_SECTIONS, FOOD_PAGES, WORKOUT_DETAIL];

  it('moves weight history, add/edit food and a workout’s details under /home', () => {
    expect(inStack('/you/weight-history', '/home', home)).toBe('/home/weight-history');
    expect(inStack(['/you', 'weight-history', 'new'], '/home', home)).toEqual(['/home', 'weight-history', 'new']);
    expect(inStack(['/nutrition', 'food', 'new'], '/home', home)).toEqual(['/home', 'food', 'new']);
    expect(inStack(['/workout', 'session', 'day-1'], '/home', home)).toEqual(['/home', 'session', 'day-1']);
    // Their "back to the list" links come back to Home.
    expect(inStack('/nutrition', '/home', home)).toBe('/home');
    expect(inStack('/workout', '/home', home)).toBe('/home');
  });

  it('leaves full-screen routes and other pages alone', () => {
    expect(inStack(['/workout', 'session', 'day-1', 'active'], '/home', home)).toEqual(['/workout', 'session', 'day-1', 'active']);
    expect(inStack(['/nutrition', 'week'], '/home', home)).toEqual(['/nutrition', 'week']);
    expect(inStack('/home/streak', '/home', home)).toBe('/home/streak');
  });
});
