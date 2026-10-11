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
const summary = (targets: TargetState = TARGETS): DaySummaryView => {
  const input: FoodEntryInput = { name: 'Meal', quantity: 1, unit: 'serving', meal: 'lunch', calories: 1500, proteinGrams: 90, carbohydrateGrams: 100, fatGrams: 30 };
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
  it('shows protein as a labelled ring and carbs and fat as labelled bars', () => {
    const { el } = render(summary());
    const ring = el.querySelector('[data-testid=home-macro-protein] [role=progressbar]')!;
    expect(ring.getAttribute('aria-label')).toBe('Protein');
    expect(ring.getAttribute('data-variant')).toBe('ring');
    expect(clean(el.querySelector('.ring-value'))).toBe('90 g');
    expect(clean(el.querySelector('.ring-target'))).toBe('of 150 g');
    expect([...el.querySelectorAll('.macros [role=progressbar]')].map((b) => b.getAttribute('aria-label'))).toEqual(['Carbs', 'Fat']);
    expect(clean(el.querySelector('[data-testid=home-macro-carbs] .macro-value'))).toBe('100 g / 220 g');
  });

  it('without a valid target: intake only, no rings or bars, a short note and a way to Nutrition', () => {
    const { el, fixture } = render(summary({ kind: 'available', targets: { calories: { kind: 'review-required' }, macros: { kind: 'withheld', reason: 'calorie-review' } } }));
    expect(el.querySelectorAll('[role=progressbar]')).toHaveLength(0);
    expect(clean(el.querySelector('.no-target-value'))).toBe('90 g');
    expect(clean(el.querySelector('[data-testid=home-macro-fat] .macro-value'))).toBe('30 g');
    expect(clean(el.querySelector('[data-testid=target-note] p'))).toBe('Your targets need review.');
    const opened = vi.fn();
    fixture.componentInstance.openNutrition.subscribe(opened);
    el.querySelector<HTMLButtonElement>('[data-testid=target-note] button')!.click();
    expect(opened).toHaveBeenCalled();
  });

  it('Log food is an icon button with an accessible name', () => {
    const { el, fixture } = render(summary());
    const logged = vi.fn();
    fixture.componentInstance.logFood.subscribe(logged);
    const button = el.querySelector<HTMLButtonElement>('[data-testid=home-log-food]')!;
    expect(button.getAttribute('aria-label')).toBe('Log food');
    button.click();
    expect(logged).toHaveBeenCalled();
  });
});
