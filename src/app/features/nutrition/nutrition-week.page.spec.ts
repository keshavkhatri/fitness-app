import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { CurrentAssessment, FitnessAssessmentService } from '../../core/calculations/fitness-assessment.service';
import { NutritionRepository } from '../../core/nutrition/nutrition.repository';
import { NutritionService } from '../../core/nutrition/nutrition.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { FoodEntry, FoodEntryInput, createFoodEntry } from '../../domain/nutrition';
import { NutritionWeekPage } from './nutrition-week.page';
import { NutritionPage } from './nutrition.page';

// Synthetic food only. Thursday 8 October 2026, 12:30 local, is "now".
const KEY = 'fitness.nutrition-entries';
const NOW = new Date(2026, 9, 8, 12, 30);
const INPUT: FoodEntryInput = { name: 'Oats', quantity: 60, unit: 'g', meal: 'breakfast', calories: 230, proteinGrams: 8, carbohydrateGrams: 40, fatGrams: 4 };
let seq = 0;
const food = (date: string, overrides: Partial<FoodEntryInput> = {}): FoodEntry => {
  const r = createFoodEntry({ ...INPUT, ...overrides }, { id: `w${++seq}`, date, now: `${date}T08:00:00.000Z` });
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
};
/** Only the fields the nutrition target mapping reads. */
const assessment = (calories: object, macros: object): CurrentAssessment =>
  ({ kind: 'ready', profile: {} as never, assessment: { targets: { calories, macros } } as never });
const NORMAL = assessment({ finalKcal: 2000, status: 'normal' }, { status: 'feasible', proteinGrams: 140, carbohydrateGrams: 220, fatGrams: 65 });

function configure(entries: readonly FoodEntry[], targets: CurrentAssessment = NORMAL) {
  const storage = new MemoryKeyValueStorage();
  if (entries.length) {
    storage.values.set(KEY, JSON.stringify({ version: 1, entries }));
  }
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => NOW },
      { provide: FitnessAssessmentService, useValue: { current: vi.fn().mockResolvedValue(targets) } },
    ],
  });
  const nav = TestBed.inject(NavController);
  return {
    storage,
    forward: vi.spyOn(nav, 'navigateForward').mockResolvedValue(true),
    back: vi.spyOn(nav, 'navigateBack').mockResolvedValue(true),
  };
}

async function settle(fixture: ComponentFixture<unknown>) {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const byTestId = (el: Element, id: string) => el.querySelector(`[data-testid="${id}"]`);
const click = (el: Element, id: string) => (byTestId(el, id) as HTMLButtonElement).click();
const dayRows = (el: Element) => [...el.querySelectorAll('[data-testid="week-day"]')];

async function render(entries: readonly FoodEntry[], options: { targets?: CurrentAssessment; date?: string; before?: () => void } = {}) {
  const spies = configure(entries, options.targets);
  options.before?.();
  const fixture = TestBed.createComponent(NutritionWeekPage);
  if (options.date) {
    fixture.componentRef.setInput('date', options.date);
  }
  await settle(fixture);
  return { ...spies, fixture, el: fixture.nativeElement as HTMLElement };
}

const THIS_WEEK = [
  food('2026-10-05', { calories: 1800, proteinGrams: 120, carbohydrateGrams: 200, fatGrams: 60 }),
  food('2026-10-07', { calories: 2300, proteinGrams: 150, carbohydrateGrams: 260, fatGrams: 70 }),
];

describe('Weekly nutrition summary', () => {
  it('opens on this Monday–Sunday week with the average, total and day-by-day breakdown', async () => {
    const { el } = await render([...THIS_WEEK, food('2026-10-04', { calories: 999 })]);
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Nutrition');
    expect(clean(byTestId(el, 'week-title'))).toBe('This week');
    expect(clean(byTestId(el, 'week-range'))).toBe('5 – 11 Oct 2026');
    expect(clean(byTestId(el, 'logged-days'))).toBe('Food logged on 2 of 4 days so far');
    const tile = (key: string) => byTestId(el, `average-${key}`)!;
    expect(clean(tile('calories').querySelector('.visually-hidden'))).toBe('Calories: 2,050 kcal a day, 3% over your 2,000 kcal target');
    expect(clean(tile('calories').querySelector('.comparison'))).toBe('+3%');
    expect(clean(byTestId(el, 'average-comparison'))).toBe('50 kcal over your daily target');
    expect(clean(tile('protein').querySelector('.visually-hidden'))).toBe('Protein: 135 g a day, 96% of your 140 g target');
    expect(clean(tile('protein').querySelector('.value'))).toBe('135 g');
    expect(clean(tile('protein').querySelector('.comparison'))).toBe('96%');
    expect(clean(byTestId(el, 'total-calories'))).toBe('4,100 kcal'); // last week's 999 is excluded
    expect(dayRows(el).map((r) => r.getAttribute('data-status'))).toEqual(['logged', 'not-logged', 'logged', 'not-logged', 'upcoming', 'upcoming', 'upcoming']);
    expect(clean(dayRows(el)[0])).toBe('Monday 5 Oct 1,800 kcal P 120 g · C 200 g · F 60 g 200 kcal below target');
    expect(clean(dayRows(el)[1])).toBe('Tuesday 6 Oct Nothing logged');
    expect(clean(dayRows(el)[4])).toBe('Friday 9 Oct Upcoming');
  });

  it('days are accessible: past days and today are named buttons, upcoming days aren’t interactive', async () => {
    const { el } = await render(THIS_WEEK);
    const buttons = dayRows(el).map((r) => r.querySelector('button'));
    expect(buttons.filter(Boolean)).toHaveLength(4);
    expect(buttons[0]?.getAttribute('aria-label')).toBe(
      'Open Monday, 5 Oct in your food log. 1,800 kcal, protein 120 g, carbs 200 g, fat 60 g. 200 kcal below target',
    );
    expect(buttons[3]?.getAttribute('aria-label')).toBe('Open Today, 8 Oct in your food log. Nothing logged');
    expect(buttons[6]).toBeNull();
    expect(byTestId(el, 'previous-week')?.getAttribute('aria-label')).toBe('Previous week');
    expect(byTestId(el, 'week-average')?.querySelector('fit-progress')?.getAttribute('aria-label')).toBe('Protein daily average');
  });

  it('moves between weeks, never past this one, and back to this week', async () => {
    const { el, fixture } = await render([...THIS_WEEK, food('2026-09-30', { calories: 1500 })]);
    expect((byTestId(el, 'next-week') as HTMLButtonElement).disabled).toBe(true);
    expect(byTestId(el, 'this-week')).toBeNull();

    click(el, 'previous-week');
    await settle(fixture);
    expect(clean(byTestId(el, 'week-title'))).toBe('Last week');
    expect(clean(byTestId(el, 'week-range'))).toBe('28 Sep – 4 Oct 2026');
    expect(clean(byTestId(el, 'logged-days'))).toBe('Food logged on 1 of 7 days');
    expect(clean(byTestId(el, 'total-calories'))).toBe('1,500 kcal');
    expect(dayRows(el).every((r) => r.getAttribute('data-status') !== 'upcoming')).toBe(true);
    expect(clean(byTestId(el, 'announcement'))).toBe('Last week, 28 Sep – 4 Oct 2026. Food logged on 1 of 7 days.');

    click(el, 'previous-week');
    await settle(fixture);
    expect(clean(byTestId(el, 'week-range'))).toBe('21 – 27 Sep 2026');
    expect(byTestId(el, 'week-title')).toBeNull(); // the range alone names an older week

    click(el, 'next-week');
    await settle(fixture);
    expect(clean(byTestId(el, 'week-title'))).toBe('Last week');

    click(el, 'this-week');
    await settle(fixture);
    expect(clean(byTestId(el, 'week-title'))).toBe('This week');
  });

  it('opens the week of a given day; a future date opens this week', async () => {
    const past = await render(THIS_WEEK, { date: '2026-09-16' });
    expect(clean(byTestId(past.el, 'week-range'))).toBe('14 – 20 Sep 2026');
    TestBed.resetTestingModule();
    const future = await render(THIS_WEEK, { date: '2026-12-01' });
    expect(clean(byTestId(future.el, 'week-title'))).toBe('This week');
  });

  it('an empty week says so, without zeros, and offers to log food only for this week', async () => {
    const { el, fixture, forward } = await render([]);
    const empty = byTestId(el, 'week-empty')!;
    expect(clean(empty)).toContain('No food logged this week');
    expect(byTestId(el, 'week-average')).toBeNull();
    expect(byTestId(el, 'week-total')).toBeNull();
    expect(el.textContent).not.toMatch(/\b0 kcal\b/);
    [...empty.querySelectorAll('button')].find((b) => clean(b) === 'Log food')!.click();
    expect(forward).toHaveBeenCalledWith(['/nutrition', 'food', 'new'], { queryParams: { meal: 'lunch', date: '2026-10-08' } });

    click(el, 'previous-week');
    await settle(fixture);
    expect([...byTestId(el, 'week-empty')!.querySelectorAll('button')]).toHaveLength(0);
  });

  it('without valid targets: intake only, a short reason, no comparisons', async () => {
    const { el } = await render(THIS_WEEK, { targets: assessment({ finalKcal: 1100, status: 'review-required' }, { status: 'feasible', proteinGrams: 1, carbohydrateGrams: 1, fatGrams: 1 }) });
    expect(clean(byTestId(el, 'average-calories')?.querySelector('.visually-hidden'))).toBe('Calories: 2,050 kcal a day');
    expect(byTestId(el, 'average-calories')?.querySelector('.comparison')).toBeNull();
    expect(byTestId(el, 'average-comparison')).toBeNull();
    expect(byTestId(el, 'calorie-chart')?.querySelector('.target')).toBeNull();
    expect(clean(byTestId(el, 'target-note'))).toBe('Your targets need review.');
    expect(byTestId(el, 'week-average')?.querySelectorAll('fit-progress')).toHaveLength(0);
    expect(el.textContent).not.toContain('1,100');
    expect(clean(dayRows(el)[0])).toBe('Monday 5 Oct 1,800 kcal P 120 g · C 200 g · F 60 g');
  });

  it('charts calories by day against the target; days without food have no bar (never zero)', async () => {
    const { el, fixture } = await render(THIS_WEEK);
    const chart = byTestId(el, 'calorie-chart')!;
    const columns = [...chart.querySelectorAll('.column')];
    expect(columns.map((c) => c.getAttribute('data-status'))).toEqual(['logged', 'not-logged', 'logged', 'not-logged', 'upcoming', 'upcoming', 'upcoming']);
    expect(columns.map((c) => (c.querySelector('.bar') as HTMLElement | null)?.style.height ?? null)).toEqual(['75%', null, '95.83%', null, null, null, null]);
    expect(columns[1].querySelector('.missing')).not.toBeNull();
    expect(columns.filter((c) => c.querySelector('.target')).map((c) => (c.querySelector('.target') as HTMLElement).style.height)).toEqual(['83.33%', '83.33%', '83.33%', '83.33%']);
    expect([...chart.querySelectorAll('.tick')].map((t) => clean(t))).toEqual(['2.4k', '1.8k', '1.2k', '600', '0']);
    const spoken = [...chart.querySelectorAll('ul.visually-hidden li')].map((li) => clean(li));
    expect(spoken).toEqual([
      'Monday 5 Oct: 1,800 kcal',
      'Tuesday 6 Oct: nothing logged',
      'Wednesday 7 Oct: 2,300 kcal',
      'Thursday 8 Oct: nothing logged',
      'Friday 9 Oct: upcoming',
      'Saturday 10 Oct: upcoming',
      'Sunday 11 Oct: upcoming',
      'Daily target 2,000 kcal',
    ]);
    expect([...chart.querySelectorAll('.legend li')].map((li) => clean(li))).toEqual(['Food', 'Daily target', '– Not logged']);

    const macros = byTestId(el, 'macro-chart')!;
    expect(macros.querySelector('ul.visually-hidden')?.getAttribute('aria-label')).toBe('Protein by day');
    expect(clean(macros.querySelector('ul.visually-hidden li'))).toBe('Monday 5 Oct: 120 g');
    macros.querySelector<HTMLInputElement>('input[value="fat"]')!.click();
    fixture.detectChanges();
    expect(macros.querySelector('ul.visually-hidden')?.getAttribute('aria-label')).toBe('Fat by day');
    expect(clean(macros.querySelector('ul.visually-hidden li:last-child'))).toBe('Daily target 65 g');
  });

  it('Day returns to the daily log', async () => {
    const { el, back } = await render(THIS_WEEK);
    expect(byTestId(el, 'views')?.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Week');
    click(el, 'day-view');
    expect(back).toHaveBeenCalledWith('/nutrition');
  });

  it('opening a day shows it in the food log, without changing any entry', async () => {
    const { el, fixture, back, storage } = await render(THIS_WEEK);
    const before = storage.values.get(KEY);
    dayRows(el)[0].querySelector('button')!.click();
    await settle(fixture);
    expect(TestBed.inject(NutritionService).selectedDate()).toBe('2026-10-05');
    expect(back).toHaveBeenCalledWith('/nutrition');
    expect(storage.values.get(KEY)).toBe(before);
  });

  it('shows a loading state, and an error with retry when the food log can’t be read', async () => {
    configure(THIS_WEEK);
    vi.spyOn(TestBed.inject(NutritionRepository), 'loadRange').mockReturnValue(new Promise(() => undefined));
    const loading = TestBed.createComponent(NutritionWeekPage);
    loading.detectChanges();
    expect(byTestId(loading.nativeElement, 'week-loading')?.getAttribute('aria-busy')).toBe('true');
    expect(clean(byTestId(loading.nativeElement, 'announcement'))).toBe('Loading your week');

    TestBed.resetTestingModule();
    const { el, fixture } = await render(THIS_WEEK, {
      before: () => vi.spyOn(TestBed.inject(NutritionRepository), 'loadRange').mockRejectedValueOnce(new Error('boom')),
    });
    expect(clean(byTestId(el, 'week-error'))).toContain("We couldn't load this week");
    [...byTestId(el, 'week-error')!.querySelectorAll('button')].find((b) => clean(b) === 'Try again')!.click();
    await settle(fixture);
    expect(clean(byTestId(el, 'total-calories'))).toBe('4,100 kcal');
  });

  it('re-entering the page re-reads the week (e.g. after logging food)', async () => {
    const { el, fixture } = await render(THIS_WEEK);
    fixture.componentInstance.ionViewWillEnter(); // first entry: no reload
    await TestBed.inject(NutritionService).add({ ...INPUT, calories: 400 }, '2026-10-08');
    fixture.componentInstance.ionViewWillEnter();
    await settle(fixture);
    expect(clean(byTestId(el, 'total-calories'))).toBe('4,500 kcal');
    expect(clean(byTestId(el, 'logged-days'))).toBe('Food logged on 3 of 4 days so far');
  });
});

describe('Nutrition dashboard → weekly summary', () => {
  it('opens the week of the day shown', async () => {
    const { forward } = configure(THIS_WEEK);
    const fixture = TestBed.createComponent(NutritionPage);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const button = byTestId(el, 'open-week') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Weekly summary');
    button.click();
    expect(forward).toHaveBeenCalledWith(['/nutrition', 'week'], { queryParams: { date: '2026-10-08' } });
  });
});
