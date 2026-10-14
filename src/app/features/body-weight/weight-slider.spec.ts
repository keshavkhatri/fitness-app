import { weightSlider } from './weight-history-view-model';

describe('weightSlider', () => {
  it('is a ±10 window around the reference, following a typed number inside it', () => {
    expect(weightSlider(80.4, '', 'metric')).toEqual({ min: 70, max: 91, value: 80.4, ticks: [70, 74, 78, 83, 87, 91] });
    expect(weightSlider(80.4, '82,5', 'metric')?.value).toBe(82.5);
    // Out of the window or not a number: back to the reference (never a guess from bad input).
    expect(weightSlider(80.4, '120', 'metric')?.value).toBe(80.4);
    expect(weightSlider(80.4, 'abc', 'metric')?.value).toBe(80.4);
  });

  it('has no slider without a reference weight', () => {
    expect(weightSlider(null, '80', 'metric')).toBeNull();
  });

  it('stays within the weights the app accepts, in the unit shown', () => {
    expect(weightSlider(22, '', 'metric')?.min).toBe(20);
    expect(weightSlider(177.2, '', 'imperial')).toMatchObject({ min: 167, max: 188 });
  });
});
