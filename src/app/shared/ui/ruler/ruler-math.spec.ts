import { clampToScale, releaseVelocity, snapToTick, stepDecimals, stepFrom, tickIndex, valueAfterDrag, valueAtOffset, visibleTicks } from './ruler-math';

const CM = { min: 50, max: 275, step: 1 };
const KG = { min: 20, max: 500, step: 0.1 };
const LB = { min: 44.1, max: 1102.3, step: 0.1 };

describe('ruler math', () => {
  it('knows a step’s decimals', () => {
    expect([stepDecimals(1), stepDecimals(0.1), stepDecimals(0.25)]).toEqual([0, 1, 2]);
  });

  describe('snapping', () => {
    it('goes to the nearest tick', () => {
      expect(snapToTick(172.4, CM)).toBe(172);
      expect(snapToTick(172.5, CM)).toBe(173);
      expect(snapToTick(70.04, KG)).toBe(70);
      expect(snapToTick(70.06, KG)).toBe(70.1);
    });

    it('never leaves the scale', () => {
      expect(snapToTick(10, CM)).toBe(50);
      expect(snapToTick(999, CM)).toBe(275);
      expect(clampToScale(-5, KG)).toBe(20);
      expect(tickIndex(1e6, KG)).toBe(4800);
    });

    it('stays on clean decimals however far it steps (no float drift)', () => {
      let value = 20;
      for (let i = 0; i < 4800; i++) {
        value = stepFrom(value, 1, KG);
        expect(String(value)).toMatch(/^\d+(\.\d)?$/);
      }
      expect(value).toBe(500);
      expect(stepFrom(70.1, 1, KG)).toBe(70.2);
    });

    it('steps from the nearest tick, clamped at the ends', () => {
      expect(stepFrom(172.5, 1, CM)).toBe(174);
      expect(stepFrom(274, 10, CM)).toBe(275);
      expect(stepFrom(51, -10, CM)).toBe(50);
    });

    it('keeps ticks on the scale’s own grid when min is not a round number', () => {
      expect(snapToTick(44.14, LB)).toBe(44.1);
      expect(snapToTick(1102.36, LB)).toBe(1102.3);
    });
  });

  describe('dragging and tapping', () => {
    it('moves one step per tick spacing, following the pointer (unsnapped)', () => {
      // A positive delta brings lower values to the marker.
      expect(valueAfterDrag(170, -26 * 5, 26, CM)).toBe(175);
      expect(valueAfterDrag(170, 13, 26, CM)).toBe(169.5);
      expect(valueAfterDrag(70, -15, 10, KG)).toBeCloseTo(70.15);
    });

    it('stops at the ends of the scale', () => {
      expect(valueAfterDrag(60, 10_000, 26, CM)).toBe(50);
      expect(valueAfterDrag(270, -10_000, 26, CM)).toBe(275);
    });

    it('picks the tick under a tap', () => {
      expect(valueAtOffset(170, 52, 26, CM)).toBe(172);
      expect(valueAtOffset(170, -60, 26, CM)).toBe(168); // 2.3 ticks → nearest
      expect(valueAtOffset(70, 30, 10, KG)).toBe(70.3);
      expect(valueAtOffset(51, -500, 26, CM)).toBe(50);
    });

    it('reads a flick from the last 100 ms only, so a paused drag does not fling', () => {
      expect(releaseVelocity([{ t: 0, p: 0 }, { t: 50, p: 50 }, { t: 100, p: 100 }])).toBe(1);
      expect(releaseVelocity([{ t: 0, p: 0 }, { t: 50, p: 100 }, { t: 400, p: 100 }])).toBe(0);
      expect(releaseVelocity([])).toBe(0);
    });
  });

  describe('visible ticks', () => {
    it('draws only those near the marker', () => {
      const ticks = visibleTicks(70, 30, KG, 10, 10);
      expect(ticks).toHaveLength(61);
      expect(ticks[0].value).toBe(67);
      expect(ticks.at(-1)!.value).toBe(73);
    });

    it('marks majors, mids and labels on round values', () => {
      const ticks = visibleTicks(70, 5, KG, 10, 10);
      expect(ticks.filter((t) => t.major).map((t) => t.value)).toEqual([70]);
      expect(ticks.filter((t) => t.mid).map((t) => t.value)).toEqual([69.5, 70.5]);
      expect(ticks.filter((t) => t.labelled).map((t) => t.value)).toEqual([70]);
      expect(visibleTicks(45, 10, LB, 10, 10).filter((t) => t.labelled).map((t) => t.value)).toEqual([45, 46]); // not 44.1
    });

    it('stops at the ends of the scale', () => {
      expect(visibleTicks(50, 5, CM, 5, 1).map((t) => t.value)).toEqual([50, 51, 52, 53, 54, 55]);
    });
  });
});
