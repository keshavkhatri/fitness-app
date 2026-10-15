/**
 * The user's text size as a multiplier (Android "Font size", a browser's default font size), 1 when
 * unchanged. A WebView draws glyphs at the zoomed size but leaves every length (px, rem, em) alone,
 * so a fixed-size box around a number (a progress ring) is outgrown by it. The zoom is visible only
 * as the root element's computed font size (24px at 150%, from a 16px default), so it's published
 * as `--text-scale` for boxes that must grow with their text: `calc(92px * var(--text-scale, 1))`.
 */
const DEFAULT_ROOT_FONT_SIZE = 16;
const MAX_SCALE = 2;

export function readTextScale(doc: Document, win: Window): number {
  const size = parseFloat(win.getComputedStyle(doc.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? Math.min(MAX_SCALE, Math.max(1, size / DEFAULT_ROOT_FONT_SIZE)) : 1;
}

/** Publishes `--text-scale` now and again when the screen resizes or the app returns to the foreground. */
export function trackTextScale(doc: Document = document, win: Window = window): void {
  const apply = () => doc.documentElement.style.setProperty('--text-scale', String(Math.round(readTextScale(doc, win) * 100) / 100));
  apply();
  win.addEventListener('resize', apply);
  doc.addEventListener('visibilitychange', apply);
}
