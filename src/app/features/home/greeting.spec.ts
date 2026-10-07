import { greetingFor } from './greeting';

const at = (hour: number) => new Date(2026, 0, 1, hour, 0, 0);

describe('greetingFor', () => {
  it('greets by time of day', () => {
    expect(greetingFor(at(6))).toBe('Good morning');
    expect(greetingFor(at(11))).toBe('Good morning');
    expect(greetingFor(at(12))).toBe('Good afternoon');
    expect(greetingFor(at(17))).toBe('Good afternoon');
    expect(greetingFor(at(18))).toBe('Good evening');
    expect(greetingFor(at(2))).toBe('Good evening');
  });
});
