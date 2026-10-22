import { inStack } from './stack-nav';

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
