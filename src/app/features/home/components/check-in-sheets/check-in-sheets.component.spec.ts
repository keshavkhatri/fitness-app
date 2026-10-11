import { parseSteps } from './check-in-sheets.component';

describe('parseSteps', () => {
  it('accepts whole numbers with grouping, within the plausible range', () => {
    expect(parseSteps('8200')).toBe(8200);
    expect(parseSteps(' 8,200 ')).toBe(8200);
    expect(parseSteps('0')).toBe(0);
    expect(parseSteps('100000')).toBe(100_000);
  });

  it('rejects anything else', () => {
    for (const text of ['', 'abc', '-5', '8200 steps', '100001', '1e4']) {
      expect(parseSteps(text)).toBeNull();
    }
  });
});
