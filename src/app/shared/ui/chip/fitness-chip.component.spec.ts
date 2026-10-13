import { TestBed } from '@angular/core/testing';

import { FitnessChipComponent, FitnessChipFill } from './fitness-chip.component';
import { FitnessTone } from '../tone';

function render(inputs: { tone?: FitnessTone; fill?: FitnessChipFill } = {}) {
  const fixture = TestBed.createComponent(FitnessChipComponent);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('FitnessChipComponent', () => {
  it('defaults to a soft neutral chip', () => {
    const chip = render();

    expect(chip.dataset['tone']).toBe('neutral');
    expect(chip.dataset['fill']).toBe('soft');
  });

  it('exposes a solid fill for live-state badges', () => {
    const chip = render({ tone: 'primary', fill: 'solid' });

    expect(chip.dataset['tone']).toBe('primary');
    expect(chip.dataset['fill']).toBe('solid');
  });
});
