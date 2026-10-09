import { TestBed } from '@angular/core/testing';

import { TargetState } from '../../../../core/nutrition/nutrition.service';
import { FoodEntryInput, createFoodEntry, nutritionDay } from '../../../../domain/nutrition';
import { DaySummaryView, toDaySummary } from '../../../nutrition/nutrition-view-model';
import { NutritionSummaryCardComponent } from './nutrition-summary-card.component';

const TARGETS: TargetState = {
  kind: 'available',
  targets: {
    calories: { kind: 'target', kcal: 2000, adjusted: false },
    macros: { kind: 'target', proteinGrams: 150, carbohydrateGrams: 220, fatGrams: 65, constrained: false },
  },
};
const summary = (calories: number, targets: TargetState = TARGETS): DaySummaryView => {
  const input: FoodEntryInput = { name: 'Meal', quantity: 1, unit: 'serving', meal: 'lunch', calories, proteinGrams: 90, carbohydrateGrams: 100, fatGrams: 30 };
  const entry = createFoodEntry(input, { id: 'a', date: '2026-10-08', now: '2026-10-08T12:00:00.000Z' });
  return toDaySummary(nutritionDay(entry.ok ? [entry.value] : [], '2026-10-08'), targets);
};

function render(value: DaySummaryView) {
  const fixture = TestBed.createComponent(NutritionSummaryCardComponent);
  fixture.componentRef.setInput('summary', value);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}
const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('NutritionSummaryCardComponent', () => {
  it('shows calories remaining under target', () => {
    const { el } = render(summary(1500));
    expect(el.textContent).toContain('Remaining');
    expect(clean(el.querySelector('.remaining'))).toBe('500 kcal');
    expect(clean(el.querySelector('[data-testid=calories-target]'))).toBe('Daily target 2,000 kcal');
  });

  it('shows the overage as a positive number when over target', () => {
    const { el } = render(summary(2300));
    expect(el.textContent).toContain('Over target');
    expect(clean(el.querySelector('.remaining'))).toBe('300 kcal');
    expect(el.querySelector('fit-progress[variant=ring], fit-progress')?.getAttribute('data-tone')).toBe('warning');
  });

  it('renders a labelled progress bar per macro', () => {
    const { el } = render(summary(1500));
    expect(el.querySelector('.macros fit-progress')?.getAttribute('aria-label')).toBe('Protein');
    expect(clean(el.querySelector('[data-testid=home-macro-protein] .macro-value'))).toBe('90 g / 150 g');
  });

  it('without a valid target: intake only, a short note and a way to Nutrition', () => {
    const { el, fixture } = render(summary(1500, { kind: 'available', targets: { calories: { kind: 'review-required' }, macros: { kind: 'withheld', reason: 'calorie-review' } } }));
    expect(clean(el.querySelector('[data-testid=calories-eaten]'))).toBe('1,500');
    expect(clean(el.querySelector('[data-testid=calories-target]'))).toBe('Not available');
    expect(el.querySelector('.remaining')).toBeNull();
    expect(el.querySelectorAll('.macros fit-progress')).toHaveLength(0);
    expect(clean(el.querySelector('[data-testid=home-macro-protein] .macro-value'))).toBe('90 g');
    expect(clean(el.querySelector('[data-testid=target-note] p'))).toBe('Your targets need review.');
    const opened = vi.fn();
    fixture.componentInstance.openNutrition.subscribe(opened);
    el.querySelector<HTMLButtonElement>('[data-testid=target-note] button')!.click();
    expect(opened).toHaveBeenCalled();
  });
});
