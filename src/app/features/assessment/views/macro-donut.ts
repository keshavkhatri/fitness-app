import { MacroRowViewModel } from '../assessment-view-model';

/** Donut geometry for the macro split (viewBox 0 0 120 120). Pure. */
export const DONUT = { size: 120, radius: 48, stroke: 18 } as const;
const CIRCUMFERENCE = 2 * Math.PI * DONUT.radius;
/** Visual gap between slices (in px along the ring): slices stay apart without relying on colour. */
const GAP = 2;

export interface DonutSlice {
  readonly key: MacroRowViewModel['key'];
  /** stroke-dasharray: visible length, then the rest of the ring. */
  readonly dasharray: string;
  /** stroke-dashoffset placing the slice after the previous ones (starting at 12 o'clock). */
  readonly dashoffset: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** One arc per macro, sized by its share of the macros' calories, clockwise from the top. */
export function donutSlices(rows: readonly Pick<MacroRowViewModel, 'key' | 'fraction'>[]): DonutSlice[] {
  const visible = rows.filter((row) => row.fraction > 0);
  let start = 0;
  return visible.map((row) => {
    const length = row.fraction * CIRCUMFERENCE;
    const drawn = Math.max(0, length - (visible.length > 1 ? GAP : 0));
    const slice = { key: row.key, dasharray: `${round(drawn)} ${round(CIRCUMFERENCE - drawn)}`, dashoffset: round(-start) };
    start += length;
    return slice;
  });
}
