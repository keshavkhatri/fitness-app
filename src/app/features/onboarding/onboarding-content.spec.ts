import { FREQUENCY_OPTIONS } from './onboarding-content';

describe('onboarding content', () => {
  it('offers 2–6 training days per week (matching workout programming), never 7', () => {
    expect(FREQUENCY_OPTIONS.map((o) => o.value)).toEqual([2, 3, 4, 5, 6]);
  });
});
