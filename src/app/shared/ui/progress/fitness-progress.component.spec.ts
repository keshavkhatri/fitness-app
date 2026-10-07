import { TestBed } from '@angular/core/testing';

import { FitnessProgressComponent } from './fitness-progress.component';

function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(FitnessProgressComponent);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('FitnessProgressComponent', () => {
  it('exposes progressbar semantics', () => {
    const el = render({ value: 96, max: 150, label: 'Protein', valueText: '96 of 150 grams' });

    expect(el.getAttribute('role')).toBe('progressbar');
    expect(el.getAttribute('aria-label')).toBe('Protein');
    expect(el.getAttribute('aria-valuenow')).toBe('96');
    expect(el.getAttribute('aria-valuemax')).toBe('150');
    expect(el.getAttribute('aria-valuetext')).toBe('96 of 150 grams');
  });

  it('keeps aria-valuenow within range when the value overshoots', () => {
    expect(render({ value: 2600, max: 2300, label: 'Calories' }).getAttribute('aria-valuenow')).toBe('2300');
    expect(render({ value: -10, max: 100, label: 'Calories' }).getAttribute('aria-valuenow')).toBe('0');
  });

  it('clamps the bar fill between 0 and 100%', () => {
    expect(render({ value: 300, max: 150, label: 'Over' }).querySelector<HTMLElement>('.fill')?.style.width).toBe('100%');
    expect(render({ value: -5, max: 150, label: 'Under' }).querySelector<HTMLElement>('.fill')?.style.width).toBe('0%');
    expect(render({ value: 5, max: 0, label: 'No max' }).querySelector<HTMLElement>('.fill')?.style.width).toBe('0%');
  });

  it('omits the ring fill at zero progress', () => {
    const el = render({ value: 0, label: 'Calories', variant: 'ring' });

    expect(el.querySelector('circle.track')).not.toBeNull();
    expect(el.querySelector('circle.fill')).toBeNull();
  });
});
