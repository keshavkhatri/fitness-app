import { TestBed } from '@angular/core/testing';

import { AnalysisOverlayComponent, shuffled } from './analysis-overlay.component';

function render(options: { shuffle?: boolean; closing?: string | null } = {}) {
  const fixture = TestBed.createComponent(AnalysisOverlayComponent);
  fixture.componentRef.setInput('title', 'Reading your report');
  fixture.componentRef.setInput('messages', ['One', 'Two', 'Three']);
  fixture.componentRef.setInput('closingMessage', options.closing === undefined ? 'Almost there' : options.closing);
  fixture.componentRef.setInput('interval', 1000);
  fixture.componentRef.setInput('shuffle', options.shuffle ?? false);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const message = () => el.querySelector('[data-testid="analysis-message"]')?.textContent?.trim();
  const tick = (ms: number) => {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  };
  return { fixture, el, message, tick };
}

describe('AnalysisOverlayComponent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is a modal dialog named by its title, announced once, with its messages hidden from assistive technology', () => {
    const { el } = render();
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Reading your report');
    expect(el.querySelector('[role="status"]')?.textContent?.trim()).toBe('Reading your report');
    expect(el.querySelector('[data-testid="analysis-message"]')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('changes the message every interval and settles on the closing message, which then stays', () => {
    const { message, tick } = render();
    expect(message()).toBe('One');
    tick(1000);
    expect(message()).toBe('Two');
    tick(1000);
    expect(message()).toBe('Three');
    tick(1000);
    expect(message()).toBe('Almost there');
    tick(10_000);
    expect(message()).toBe('Almost there');
  });

  it('shows every message once, in a random order, before the closing one', () => {
    const { message, tick } = render({ shuffle: true });
    const seen = [message()];
    for (let i = 0; i < 3; i++) {
      tick(1000);
      seen.push(message());
    }
    expect(seen.slice(0, 3).sort()).toEqual(['One', 'Three', 'Two']);
    expect(seen[3]).toBe('Almost there');
  });

  it('without a closing message it stays on the last one', () => {
    const { message, tick } = render({ closing: null });
    tick(30_000);
    expect(message()).toBe('Three');
  });

  it('offers Cancel, and says so when asked', () => {
    const { fixture, el } = render();
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);
    el.querySelector<HTMLButtonElement>('[data-testid="analysis-cancel"]')!.click();
    expect(cancelled).toHaveBeenCalledOnce();
  });
});

describe('shuffled', () => {
  it('returns every item once, leaves the input alone, and follows the random numbers it is given', () => {
    const input = [1, 2, 3, 4];
    const out = shuffled(input, () => 0);
    expect([...out].sort()).toEqual([1, 2, 3, 4]);
    expect(input).toEqual([1, 2, 3, 4]);
    expect(out).toEqual([2, 3, 4, 1]);
  });
});
