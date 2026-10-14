/**
 * The arithmetic behind `fit-ruler`: a scale of evenly spaced ticks from
 * `min` to `max`, one tick every `step`. Pure; the component only draws
 * and reacts to input.
 *
 * Values are worked out as whole tick indexes, so stepping by 0.1 never
 * collects floating-point drift (70.1 + 0.1 is 70.2, not 70.19999).
 */

export interface RulerScale {
  readonly min: number;
  readonly max: number;
  /** Distance between ticks, in the ruler's unit (e.g. 1 cm, 0.1 kg). */
  readonly step: number;
}

export interface RulerTick {
  readonly value: number;
  /** Ticks from `min`: stable, so it tracks the tick in a list. */
  readonly index: number;
  /**
   * Every `majorEvery`th tick is longer, counted from zero rather than from
   * `min`, so majors and labels land on round values (45 lb, not 44.1 lb).
   */
  readonly major: boolean;
  /** Halfway between majors (when `majorEvery` is even). */
  readonly mid: boolean;
  readonly labelled: boolean;
}

/** Decimal places of a step (0.1 → 1, 0.25 → 2, 1 → 0). */
export function stepDecimals(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export function clampToScale(value: number, { min, max }: RulerScale): number {
  return Math.min(max, Math.max(min, value));
}

/** The nearest tick's index (inside the scale). */
export function tickIndex(value: number, scale: RulerScale): number {
  const last = Math.round((scale.max - scale.min) / scale.step);
  return Math.min(last, Math.max(0, Math.round((value - scale.min) / scale.step)));
}

export function tickValue(index: number, scale: RulerScale): number {
  return round(scale.min + index * scale.step, stepDecimals(scale.step));
}

/** The nearest tick to a value, inside the scale. */
export function snapToTick(value: number, scale: RulerScale): number {
  return tickValue(tickIndex(clampToScale(value, scale), scale), scale);
}

/** The tick `count` steps from a value's nearest tick (negative goes down), inside the scale. */
export function stepFrom(value: number, count: number, scale: RulerScale): number {
  return snapToTick(snapToTick(value, scale) + count * scale.step, scale);
}

/**
 * The value under the centre after moving the scale by `deltaPx`, unsnapped
 * so the scale follows the pointer smoothly, but never beyond the scale.
 * A positive delta always shows lower values (the scale moves right or
 * down, bringing what was left of or below the centre to it): callers
 * pass the movement in the direction that reads that way.
 */
export function valueAfterDrag(startValue: number, deltaPx: number, pxPerStep: number, scale: RulerScale): number {
  return clampToScale(startValue - (deltaPx / pxPerStep) * scale.step, scale);
}

/** The value of the point `offsetPx` from the centre (positive is towards higher values). */
export function valueAtOffset(centerValue: number, offsetPx: number, pxPerStep: number, scale: RulerScale): number {
  return snapToTick(centerValue + (offsetPx / pxPerStep) * scale.step, scale);
}

/**
 * The ticks within `halfCount` steps either side of a value (only those
 * drawn: a 20–500 kg scale in 0.1 kg steps has 4,801 ticks).
 */
export function visibleTicks(
  value: number,
  halfCount: number,
  scale: RulerScale,
  majorEvery: number,
  labelEvery: number,
): RulerTick[] {
  const centre = tickIndex(value, scale);
  const last = Math.round((scale.max - scale.min) / scale.step);
  const ticks: RulerTick[] = [];
  for (let index = Math.max(0, centre - halfCount); index <= Math.min(last, centre + halfCount); index++) {
    const value = tickValue(index, scale);
    const count = Math.round(value / scale.step);
    ticks.push({
      value,
      index,
      major: count % majorEvery === 0,
      mid: majorEvery % 2 === 0 && count % majorEvery === majorEvery / 2,
      labelled: count % labelEvery === 0,
    });
  }
  return ticks;
}

/**
 * Release speed (px per ms) from the last pointer samples, for a flick.
 * Only the last ~100 ms count, so a drag that stopped before release
 * doesn't fling.
 */
export function releaseVelocity(samples: readonly { readonly t: number; readonly p: number }[]): number {
  const last = samples.at(-1);
  if (!last) {
    return 0;
  }
  const recent = samples.filter((s) => last.t - s.t <= 100);
  const first = recent[0];
  const dt = last.t - first.t;
  return dt > 0 ? (last.p - first.p) / dt : 0;
}
