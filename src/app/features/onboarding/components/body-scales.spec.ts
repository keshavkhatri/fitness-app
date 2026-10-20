import { HEIGHT_CM, WEIGHT_KG } from '../../../domain/fitness-profile';
import {
  bmiReference,
  feetInchesLabel,
  heightFromScale,
  heightOnScale,
  heightScale,
  spokenHeight,
  spokenWeight,
  weightFromScale,
  weightOnScale,
  weightScale,
} from './body-scales';

const ticks = (scale: { min: number; max: number; step: number }) =>
  Array.from({ length: Math.round((scale.max - scale.min) / scale.step) + 1 }, (_, i) => Math.round((scale.min + i * scale.step) * 10) / 10);

describe('body scales', () => {
  it('use the profile’s own ranges, rounded inwards in imperial', () => {
    expect(heightScale('metric')).toEqual({ min: 50, max: 275, step: 1 });
    expect(heightScale('imperial')).toEqual({ min: 20, max: 108, step: 1 }); // 1′ 8″ – 9′ 0″
    expect(weightScale('metric')).toEqual({ min: 20, max: 500, step: 0.1 });
    expect(weightScale('imperial')).toEqual({ min: 44.1, max: 1102.3, step: 0.1 });
    for (const unit of ['metric', 'imperial'] as const) {
      const h = heightScale(unit);
      expect(heightFromScale(h.min, unit).centimeters).toBeGreaterThanOrEqual(HEIGHT_CM.min);
      expect(heightFromScale(h.max, unit).centimeters).toBeLessThanOrEqual(HEIGHT_CM.max);
      const w = weightScale(unit);
      expect(weightFromScale(w.min, unit).kilograms).toBeGreaterThanOrEqual(WEIGHT_KG.min);
      expect(weightFromScale(w.max, unit).kilograms).toBeLessThanOrEqual(WEIGHT_KG.max);
    }
  });

  it('every height tick converts to canonical cm and shows as the same tick again (no drift)', () => {
    for (const unit of ['metric', 'imperial'] as const) {
      for (const tick of ticks(heightScale(unit))) {
        expect(heightOnScale(heightFromScale(tick, unit), unit)).toBe(tick);
      }
    }
  });

  it('every weight tick converts to canonical kg and shows as the same tick again (no drift)', () => {
    for (const unit of ['metric', 'imperial'] as const) {
      for (const tick of ticks(weightScale(unit))) {
        expect(weightOnScale(weightFromScale(tick, unit), unit)).toBe(tick);
      }
    }
  });

  it('switching units only changes what is shown, never the stored value', () => {
    const height = { centimeters: 172.5 }; // e.g. as printed on a report
    expect(heightOnScale(height, 'metric')).toBe(172.5); // shown exactly, between ticks
    expect(heightOnScale(height, 'imperial')).toBe(68); // 5′ 8″
    expect(height).toEqual({ centimeters: 172.5 });
    expect(weightOnScale({ kilograms: 80 }, 'imperial')).toBe(176.4);
    expect(weightFromScale(176.4, 'imperial')).toEqual({ kilograms: 80.01 });
    expect(weightOnScale({ kilograms: 80.01 }, 'imperial')).toBe(176.4);
  });

  it('labels and speaks values in the user’s units', () => {
    expect(feetInchesLabel(70)).toBe('5′ 10″');
    expect(spokenHeight(70, 'imperial')).toBe('5 feet 10 inches');
    expect(spokenHeight(13, 'imperial')).toBe('1 foot 1 inch');
    expect(spokenHeight(179, 'metric')).toBe('179 centimeters');
    expect(spokenWeight(94.5, 'metric')).toBe('94.5 kilograms');
    expect(spokenWeight(208.3, 'imperial')).toBe('208.3 pounds');
  });
});

describe('bmiReference', () => {
  it('shows the BMI bands as weights for the height, marking the current one', () => {
    const bands = bmiReference({ centimeters: 180 }, { kilograms: 94.5 }, 'metric');
    expect(bands.map((b) => b.range)).toEqual(['< 60', '60 – 81', '81 – 97', '> 97']);
    expect(bands.find((b) => b.current)?.key).toBe('over');
  });

  it('uses pounds for imperial', () => {
    const bands = bmiReference({ centimeters: 180 }, { kilograms: 70 }, 'imperial');
    expect(bands[0].range).toBe('< 132');
    expect(bands.find((b) => b.current)?.key).toBe('normal');
  });
});
