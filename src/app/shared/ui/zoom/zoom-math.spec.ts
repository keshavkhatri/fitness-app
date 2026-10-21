import { ZOOM_MAX, ZOOM_RESET, ZOOM_TAP, clampPan, clampScale, panBy, toggleZoom, zoomAt } from './zoom-math';

const size = { width: 400, height: 300 };

describe('zoom maths', () => {
  it('keeps the scale within 1 to 5 and treats junk as 1', () => {
    expect(clampScale(0.2)).toBe(1);
    expect(clampScale(9)).toBe(ZOOM_MAX);
    expect(clampScale(Number.NaN)).toBe(1);
  });

  it('keeps the point under the fingers fixed while zooming', () => {
    const next = zoomAt(ZOOM_RESET, 2, 100, -50, size);
    // The point (100, -50) maps to itself: x' + s*px0 = px, where px0 = (px - x)/s0.
    expect(next.scale).toBe(2);
    expect(next.x).toBe(-100);
    expect(next.y).toBe(50);
  });

  it('never leaves a gap: panning is limited to the zoomed overflow', () => {
    const zoomed = { scale: 2, x: 0, y: 0 };
    expect(clampPan({ ...zoomed, x: 999, y: -999 }, size)).toEqual({ scale: 2, x: 200, y: -150 });
  });

  it('cannot be panned at fit, and zooming back out to fit recentres', () => {
    expect(panBy(ZOOM_RESET, 50, 50, size)).toEqual(ZOOM_RESET);
    expect(zoomAt({ scale: 3, x: 120, y: 40 }, 1, 0, 0, size)).toEqual(ZOOM_RESET);
  });

  it('double tap zooms in on the tapped point, and out again', () => {
    const inn = toggleZoom(ZOOM_RESET, 80, 0, size);
    expect(inn.scale).toBe(ZOOM_TAP);
    expect(toggleZoom(inn, 0, 0, size)).toEqual(ZOOM_RESET);
  });
});
