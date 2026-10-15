import { readTextScale, trackTextScale } from './text-scale';

describe('text scale', () => {
  const root = document.documentElement;
  const withRootFontSize = (px: string) => {
    root.style.fontSize = px;
    return () => root.style.removeProperty('font-size');
  };
  afterEach(() => root.style.removeProperty('--text-scale'));

  it('is the root font size over the 16px default, never below 1 or above 2', () => {
    let restore = withRootFontSize('24px');
    expect(readTextScale(document, window)).toBe(1.5);
    restore();
    restore = withRootFontSize('17.6px');
    expect(readTextScale(document, window)).toBeCloseTo(1.1);
    restore();
    restore = withRootFontSize('12px');
    expect(readTextScale(document, window)).toBe(1);
    restore();
    restore = withRootFontSize('40px');
    expect(readTextScale(document, window)).toBe(2);
    restore();
  });

  it('publishes --text-scale now and when the window resizes', () => {
    const restore = withRootFontSize('20px');
    trackTextScale(document, window);
    expect(root.style.getPropertyValue('--text-scale')).toBe('1.25');
    root.style.fontSize = '24px';
    window.dispatchEvent(new Event('resize'));
    expect(root.style.getPropertyValue('--text-scale')).toBe('1.5');
    restore();
  });
});
