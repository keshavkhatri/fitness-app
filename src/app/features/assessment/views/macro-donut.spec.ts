import { DONUT, donutSlices } from './macro-donut';

const CIRCUMFERENCE = 2 * Math.PI * DONUT.radius;
const lengthOf = (dasharray: string) => Number(dasharray.split(' ')[0]);

describe('donutSlices', () => {
  const rows = [
    { key: 'protein', fraction: 0.25 },
    { key: 'carbohydrate', fraction: 0.45 },
    { key: 'fat', fraction: 0.3 },
  ] as const;

  it('sizes each slice by its share, less a small gap, and places it after the previous ones', () => {
    const slices = donutSlices(rows);
    expect(slices.map((s) => s.key)).toEqual(['protein', 'carbohydrate', 'fat']);
    expect(lengthOf(slices[0].dasharray)).toBeCloseTo(0.25 * CIRCUMFERENCE - 2, 1);
    expect(slices[0].dashoffset).toBe(-0);
    expect(slices[1].dashoffset).toBeCloseTo(-0.25 * CIRCUMFERENCE, 1);
    expect(slices[2].dashoffset).toBeCloseTo(-0.7 * CIRCUMFERENCE, 1);
  });

  it('leaves out empty slices, and a single slice is a full ring without a gap', () => {
    expect(donutSlices([{ key: 'protein', fraction: 0 }, { key: 'fat', fraction: 1 }]).map((s) => [s.key, lengthOf(s.dasharray)])).toEqual([
      ['fat', Math.round(CIRCUMFERENCE * 100) / 100],
    ]);
  });
});
