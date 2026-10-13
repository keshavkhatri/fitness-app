import { formatElapsed, spokenElapsed } from './workout-clock';

const START = '2026-10-08T09:00:00.000Z';
const after = (seconds: number) => new Date(Date.parse(START) + seconds * 1000);

describe('workout clock', () => {
  it('formats elapsed time as mm:ss, then h:mm:ss from an hour', () => {
    expect(formatElapsed(START, after(0))).toBe('00:00');
    expect(formatElapsed(START, after(59))).toBe('00:59');
    expect(formatElapsed(START, after(504))).toBe('08:24');
    expect(formatElapsed(START, after(3599))).toBe('59:59');
    expect(formatElapsed(START, after(3600))).toBe('1:00:00');
    expect(formatElapsed(START, after(3735))).toBe('1:02:15');
  });

  it('never goes negative (clock moved back) and tolerates a bad start', () => {
    expect(formatElapsed(START, after(-30))).toBe('00:00');
    expect(formatElapsed('not a date', after(100))).toBe('00:00');
    expect(spokenElapsed('not a date', after(100))).toBe('0 minutes 0 seconds');
  });

  it('has a spoken form', () => {
    expect(spokenElapsed(START, after(504))).toBe('8 minutes 24 seconds');
    expect(spokenElapsed(START, after(61))).toBe('1 minute 1 second');
    expect(spokenElapsed(START, after(3735))).toBe('1 hour 2 minutes');
  });
});
