/** Pure maths for a pinch/drag/double-tap zoomable picture. Offsets are in px from the picture's centre. */

export interface ZoomState {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export interface ZoomSize {
  readonly width: number;
  readonly height: number;
}

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 5;
/** The scale a double tap jumps to from "fit". */
export const ZOOM_TAP = 2.5;
export const ZOOM_STEP = 1.5;
export const ZOOM_RESET: ZoomState = { scale: ZOOM_MIN, x: 0, y: 0 };

export const clampScale = (scale: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(scale) ? scale : ZOOM_MIN));

/** Keeps the zoomed picture covering the viewport: no empty gap beside it, and none at all at "fit". */
export function clampPan(state: ZoomState, size: ZoomSize): ZoomState {
  const limitX = (size.width * (state.scale - 1)) / 2;
  const limitY = (size.height * (state.scale - 1)) / 2;
  return { scale: state.scale, x: Math.min(limitX, Math.max(-limitX, state.x)), y: Math.min(limitY, Math.max(-limitY, state.y)) };
}

/**
 * Changes the scale while keeping the point under (px, py) fixed (px/py relative to the viewport's
 * centre). With a transform of `translate(x, y) scale(s)` about the centre, that point stays put when
 * x' = px - (px - x) * s'/s.
 */
export function zoomAt(state: ZoomState, nextScale: number, px: number, py: number, size: ZoomSize): ZoomState {
  const scale = clampScale(nextScale);
  if (scale === ZOOM_MIN) {
    return ZOOM_RESET;
  }
  const ratio = scale / state.scale;
  return clampPan({ scale, x: px - (px - state.x) * ratio, y: py - (py - state.y) * ratio }, size);
}

export const panBy = (state: ZoomState, dx: number, dy: number, size: ZoomSize): ZoomState =>
  state.scale === ZOOM_MIN ? state : clampPan({ ...state, x: state.x + dx, y: state.y + dy }, size);

/** Double tap: back to fit when zoomed, otherwise in on the tapped point. */
export const toggleZoom = (state: ZoomState, px: number, py: number, size: ZoomSize): ZoomState =>
  state.scale > ZOOM_MIN ? ZOOM_RESET : zoomAt(state, ZOOM_TAP, px, py, size);

export const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
