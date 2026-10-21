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
  it('shows protein as a labelled ring and calories against the target', () => {
    const { el } = render(summary());
    const ring = el.querySelector('[data-testid=home-macro-protein] [role=progressbar]')!;
    expect(ring.getAttribute('aria-label')).toBe('Protein');
    expect(ring.getAttribute('data-variant')).toBe('ring');
    expect(clean(el.querySelector('.ring-value'))).toBe('90g');
    expect(clean(el.querySelector('.ring-target'))).toBe('of 150g');
    expect(clean(el.querySelector('[data-testid=calories-eaten]'))).toBe('1,500');
    expect(clean(el.querySelector('[data-testid=calories-target]'))).toBe('/ 2,000 kcal');
    expect(el.querySelector('.cal-bar')?.getAttribute('aria-label')).toBe('Calories');
  });

  it('steps big figures down so they stay inside the ring and the card', () => {
    const input: FoodEntryInput = { name: 'Feast', quantity: 1, unit: 'serving', meal: 'lunch', calories: 10000, proteinGrams: 999, carbohydrateGrams: 100, fatGrams: 30 };
    const entry = createFoodEntry(input, { id: 'big', date: '2026-10-08', now: '2026-10-08T12:00:00.000Z' });
    const { el } = render(toDaySummary(nutritionDay(entry.ok ? [entry.value] : [], '2026-10-08'), TARGETS));
    expect(el.querySelector('.ring-value')?.getAttribute('data-fit')).toBe('snug');
    expect(el.querySelector('[data-testid=calories-eaten]')?.getAttribute('data-fit')).toBe('snug');
    // The usual figures keep the designed size.
    const usual = render(summary()).el;
    expect(usual.querySelector('.ring-value')?.getAttribute('data-fit')).toBe('fit');
    expect(usual.querySelector('[data-testid=calories-eaten]')?.getAttribute('data-fit')).toBe('fit');
  });

  it('without a valid target: intake only, no ring or bar, a short note and a way to Nutrition', () => {
    const { el, fixture } = render(summary({ kind: 'available', targets: { calories: { kind: 'review-required' }, macros: { kind: 'withheld', reason: 'calorie-review' } } }));
    expect(el.querySelectorAll('[role=progressbar]')).toHaveLength(0);
    expect(clean(el.querySelector('.no-target-value'))).toBe('90g');
    expect(clean(el.querySelector('[data-testid=calories-target]'))).toBe('kcal');
    expect(clean(el.querySelector('[data-testid=target-note] p'))).toBe('Your targets need review.');
    const opened = vi.fn();
    fixture.componentInstance.openNutrition.subscribe(opened);
    el.querySelector<HTMLButtonElement>('[data-testid=target-note] button')!.click();
    expect(opened).toHaveBeenCalled();
  });

  it('the whole card opens Nutrition through its title link', () => {
    const { el, fixture } = render(summary());
    const opened = vi.fn();
    fixture.componentInstance.openNutrition.subscribe(opened);
    const link = el.querySelector<HTMLButtonElement>('[data-testid=home-nutrition-open]')!;
    expect(link.closest('h2')?.id).toBe('home-nutrition');
    link.click();
    expect(opened).toHaveBeenCalled();
  });
});
