import { TestBed } from '@angular/core/testing';

import { NutritionDaySummary } from '../../home.models';
import { NutritionSummaryCardComponent } from './nutrition-summary-card.component';

function render(nutrition: NutritionDaySummary) {
  const fixture = TestBed.createComponent(NutritionSummaryCardComponent);
  fixture.componentRef.setInput('nutrition', nutrition);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const base: NutritionDaySummary = {
  caloriesConsumed: 1500,
  caloriesTarget: 2000,
  macros: [{ key: 'protein', label: 'Protein', consumedGrams: 90, targetGrams: 150 }],
};

describe('NutritionSummaryCardComponent', () => {
  it('shows calories remaining under target', () => {
    const el = render(base);

    expect(el.textContent).toContain('Remaining');
    expect(el.querySelector('.remaining')?.textContent).toContain('500');
  });

  it('shows the overage as a positive number when over target', () => {
    const el = render({ ...base, caloriesConsumed: 2300 });

    expect(el.textContent).toContain('Over target');
    expect(el.querySelector('.remaining')?.textContent).toContain('300');
    expect(el.querySelector('.remaining')?.textContent).not.toContain('-');
  });

  it('renders a labelled progress bar per macro', () => {
    const bar = render(base).querySelector('.macros fit-progress');

    expect(bar?.getAttribute('aria-label')).toBe('Protein');
  });
});
