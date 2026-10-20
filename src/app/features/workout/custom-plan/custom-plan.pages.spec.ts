import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { BILLING_PROVIDER } from '../../../core/entitlements/billing';
import { PREMIUM_TEST_BILLING } from '../../../core/entitlements/testing/premium-billing';
import { KeyValueStorage } from '../../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../../core/time/clock';
import { WorkoutPlanService } from '../../../core/workout/workout-plan.service';
import { WorkoutPlan, WorkoutSession } from '../../../domain/workout-programming';
import { PROFILE, THURSDAY } from '../testing/workout-fixtures';
import { WorkoutPage } from '../workout.page';
import { PrivateTestingService } from '../../../core/entitlements/private-testing/private-testing.service';
import { CustomPlanDraftService } from './custom-plan-draft.service';
import { requireCustomPlanAccess } from './custom-plan.guard';
import { CustomPlanEditorPage } from './custom-plan-editor.page';
import { ExercisePickerPage } from './exercise-picker.page';

const PLAN_KEY = 'fitness.workout-plan';
const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();

interface Options {
  premium?: boolean;
}

function configure({ premium = true }: Options = {}) {
  const storage = new MemoryKeyValueStorage();
  storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile: PROFILE }));
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => THURSDAY },
      ...(premium ? [{ provide: BILLING_PROVIDER, useValue: PREMIUM_TEST_BILLING }] : []),
    ],
  });
  const nav = TestBed.inject(NavController);
  return {
    storage,
    back: vi.spyOn(nav, 'navigateBack').mockResolvedValue(true),
    forward: vi.spyOn(nav, 'navigateForward').mockResolvedValue(true),
  };
}

const storedPlan = (storage: MemoryKeyValueStorage): WorkoutPlan => JSON.parse(storage.values.get(PLAN_KEY)!).plan;

async function view<T>(component: new () => T, inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const el = fixture.nativeElement as HTMLElement;
  const all = (id: string, root: ParentNode = el) => [...root.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
  const one = (id: string, root: ParentNode = el) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const click = async (target: HTMLElement | null) => {
    expect(target).not.toBeNull();
    target!.click();
    await settle();
  };
  const type = async (field: HTMLElement | null, value: string) => {
    const input = field!.querySelector('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  return { fixture, el, all, one, click, type, settle };
}

/** Presses Android's hardware Back: Ionic hands every registered handler to the one with the top priority. */
function pressHardwareBack(priority?: number) {
  const handlers: [number, (next: () => void) => void][] = [];
  const next = vi.fn();
  document.dispatchEvent(new CustomEvent('ionBackButton', { detail: { register: (p: number, handler: (next: () => void) => void) => handlers.push([p, handler]) } }));
  const chosen = priority === undefined ? handlers.sort((x, y) => y[0] - x[0])[0] : handlers.find(([p]) => p === priority);
  chosen?.[1](next);
  return next;
}

describe('Custom plan editor (steps 1 and 3)', () => {
  it('Basics: the header and steps, then one row per training day with its areas and count; nothing changed yet', async () => {
    const { storage } = configure();
    const { all, one } = await view(CustomPlanEditorPage);
    expect(clean(one('plan-header-title'))).toBe('Custom Workout Plan');
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('Basics');
    expect(clean(one('editor-title'))).toBe('Your training days');
    const plan = (await TestBed.inject(WorkoutPlanService).load()) as { plan: WorkoutPlan };
    const days = plan.plan.sessions.filter((s): s is WorkoutSession => s.kind === 'resistance');
    expect(all('editor-day')).toHaveLength(days.length);
    expect(clean(all('editor-day')[0])).toMatch(/^Day 1 – .+•\s*\d+ exercises/);
    const total = days.reduce((n, s) => n + s.exercises.length, 0);
    expect(clean(one('editor-overview'))).toBe(`${days.length} training days · ${total} exercises`);
    expect(storedPlan(storage).custom).toBeUndefined();
  });

  it('a day opens step 2 (the picker for that day); Next opens the first day', async () => {
    const { forward } = configure();
    const { all, one, click } = await view(CustomPlanEditorPage);
    const days = TestBed.inject(CustomPlanDraftService).draft() ?? [];
    await click(all('editor-add')[1]);
    expect(forward).toHaveBeenCalledWith(['/workout', 'plan', 'edit', days[1].sessionId, 'add']);
    await click(one('editor-review'));
    expect(forward).toHaveBeenCalledWith(['/workout', 'plan', 'edit', days[0].sessionId, 'add']);
  });

  it('an empty day blocks saving and says why on Basics and in the review; the plan is not replaced', async () => {
    const { storage } = configure();
    const drafts = TestBed.inject(CustomPlanDraftService);
    const { all, one, click, settle } = await view(CustomPlanEditorPage);
    const day = drafts.draft()![0];
    for (const e of [...day.exercises]) {
      drafts.remove(day.sessionId, e.exerciseId);
    }
    await settle();
    expect(clean(all('editor-day')[0].querySelector('[data-testid="editor-day-problem"]'))).toBe('Add at least one exercise.');

    await click(one('plan-header-save'));
    expect(clean(one('review-problems'))).toContain('Add at least one exercise');
    expect((one('review-save') as HTMLButtonElement).disabled).toBe(true);
    expect(storedPlan(storage).custom).toBeUndefined();
  });

  it('Review summarizes the plan; saving replaces the active plan, persists it and leaves the editor', async () => {
    const { storage, back } = configure();
    const drafts = TestBed.inject(CustomPlanDraftService);
    await drafts.begin();
    drafts.remove(drafts.draft()![0].sessionId, drafts.draft()![0].exercises[0].exerciseId);
    const { el, one, click, fixture, settle } = await view(CustomPlanEditorPage);
    (fixture.componentInstance as unknown as { step: { set(v: string): void } }).step.set('review');
    await settle();
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('Review');

    const review = one('review')!;
    expect(clean(review)).toContain('This replaces your current plan.');
    expect(clean(review)).toMatch(/\d+ exercises · \d+ sets/);
    const reviewed = [...el.querySelectorAll('.review-name')].map(clean);

    // The header's Save saves straight away when the plan is valid.
    await click(one('plan-header-save'));
    await vi.waitFor(() => expect(back).toHaveBeenCalledWith('/workout'));

    const saved = storedPlan(storage);
    expect(saved.custom).toEqual({ editedAt: '2026-10-08' });
    expect(saved.sessions.flatMap((s) => s.exercises.map((e) => drafts.catalog.get(e.exerciseId)!.name))).toEqual(reviewed);
    expect(drafts.draft()).toBeNull();
  });

  it('the review footer saves too, and Keep editing goes back to Basics', async () => {
    const { storage, back } = configure();
    const drafts = TestBed.inject(CustomPlanDraftService);
    await drafts.begin();
    drafts.remove(drafts.draft()![0].sessionId, drafts.draft()![0].exercises[0].exerciseId);
    const page = await view(CustomPlanEditorPage);
    const step = (page.fixture.componentInstance as unknown as { step: { set(v: string): void } }).step;
    step.set('review');
    await page.settle();
    await page.click(page.one('review-back'));
    expect(page.one('editor-title')!.textContent).toContain('Your training days');
    step.set('review');
    await page.settle();
    await page.click(page.one('review-save'));
    await vi.waitFor(() => expect(back).toHaveBeenCalledWith('/workout'));
    expect(storedPlan(storage).custom).toBeDefined();
  });

  it('editing the saved custom plan later starts from it', async () => {
    configure();
    const drafts = TestBed.inject(CustomPlanDraftService);
    await drafts.begin();
    drafts.remove(drafts.draft()![0].sessionId, drafts.draft()![0].exercises[0].exerciseId);
    const savedIds = drafts.draft()!.flatMap((d) => d.exercises.map((e) => e.exerciseId));
    const first = await view(CustomPlanEditorPage);
    await first.click(first.one('plan-header-save'));
    await vi.waitFor(() => expect(drafts.draft()).toBeNull());
    first.fixture.destroy();

    await view(CustomPlanEditorPage);
    expect(drafts.base()?.custom).toBeDefined();
    expect(drafts.draft()!.flatMap((d) => d.exercises.map((e) => e.exerciseId))).toEqual(savedIds);
  });

  it('Back with no changes leaves at once; with changes it asks first, and discarding never replaces the plan', async () => {
    const { storage, back } = configure();
    const { one, click } = await view(CustomPlanEditorPage);
    const before = storage.values.get(PLAN_KEY);

    await click(one('plan-header-back'));
    expect(back).toHaveBeenCalledWith('/workout');
    back.mockClear();

    const drafts = TestBed.inject(CustomPlanDraftService);
    const next = await view(CustomPlanEditorPage);
    drafts.remove(drafts.draft()![0].sessionId, drafts.draft()![0].exercises[0].exerciseId);
    await next.settle();
    await next.click(next.one('plan-header-back'));
    expect(back).not.toHaveBeenCalled();
    const sheet = document.querySelector('[data-testid="discard-confirm"]') as HTMLElement;
    expect(sheet).not.toBeNull();
    await next.click(sheet);
    await vi.waitFor(() => expect(back).toHaveBeenCalledWith('/workout'));
    expect(storage.values.get(PLAN_KEY)).toBe(before);
    expect(storedPlan(storage).custom).toBeUndefined();
  });

  it('Android Back is Cancel: it leaves at once when nothing changed, and asks before dropping edits', async () => {
    const { storage, back } = configure();
    const clean1 = await view(CustomPlanEditorPage);
    pressHardwareBack();
    expect(back).toHaveBeenCalledWith('/workout');
    clean1.fixture.destroy();
    back.mockClear();

    const drafts = TestBed.inject(CustomPlanDraftService);
    const edited = await view(CustomPlanEditorPage);
    drafts.remove(drafts.draft()![0].sessionId, drafts.draft()![0].exercises[0].exerciseId);
    const before = storage.values.get(PLAN_KEY);
    pressHardwareBack();
    await edited.settle();
    expect(back).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="discard-confirm"]')).not.toBeNull();
    expect(drafts.dirty()).toBe(true);
    expect(storage.values.get(PLAN_KEY)).toBe(before);
  });

  it('Android Back is left to the exercise picker while it is on top of the editor', async () => {
    const { back } = configure();
    const editor = await view(CustomPlanEditorPage);
    (editor.fixture.nativeElement as HTMLElement).classList.add('ion-page-hidden');
    // The editor's own handler (priority 10) passes Back along instead of acting.
    const next = pressHardwareBack(10);
    expect(next).toHaveBeenCalledOnce();
    expect(back).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="discard-confirm"]')).toBeNull();
  });

  it('a failed write keeps the editor open with the draft and an honest message; the active plan is unchanged', async () => {
    const { storage, back } = configure();
    const drafts = TestBed.inject(CustomPlanDraftService);
    const { one, click, settle } = await view(CustomPlanEditorPage);
    drafts.remove(drafts.draft()![0].sessionId, drafts.draft()![0].exercises[0].exerciseId);
    await settle();
    const before = storage.values.get(PLAN_KEY);
    storage.failWrites = true;
    await click(one('plan-header-save'));
    await vi.waitFor(() => expect(clean(one('review-message'))).toContain("Couldn't save your plan"));
    storage.failWrites = false;
    expect(back).not.toHaveBeenCalled();
    expect(storage.values.get(PLAN_KEY)).toBe(before);
    expect(drafts.dirty()).toBe(true);
  });
});

describe('Exercise picker and library', () => {
  const items = (el: HTMLElement) => [...el.querySelectorAll('[data-testid="picker-item"] .name')].map(clean);
  const openMyPlan = async (el: HTMLElement, settle: () => Promise<void>) => {
    el.querySelectorAll<HTMLInputElement>('[data-testid="picker-view"] input')[1].click();
    await settle();
  };

  it('browsing (no plan day) lists the whole catalog with details only; this is the Free library', async () => {
    configure({ premium: false });
    const { el, all, one } = await view(ExercisePickerPage);
    expect(clean(one('picker-title'))).toBe('Exercise library');
    expect(one('plan-header-title')).toBeNull();
    expect(all('picker-item').length).toBeGreaterThan(40);
    expect(all('picker-toggle')).toHaveLength(0);
    expect(one('picker-done')).toBeNull();
    expect(clean(one('picker-count'))).toMatch(/^\d+ exercises$/);
    expect(items(el)).toContain('Bench Press');
    // Every row says its body area and what it needs, including none.
    const pushUp = all('picker-item').find((r) => clean(r.querySelector('.name')) === 'Push-Up')!;
    expect(clean(pushUp.querySelector('.meta'))).toBe('Chest • Bodyweight');
  });

  it('opens an exercise’s details: photo caption, equipment, muscles, description and the demonstration', async () => {
    configure({ premium: false });
    const { all, click, settle } = await view(ExercisePickerPage);
    const row = all('picker-item').find((r) => clean(r.querySelector('.name')) === 'Bench Press')!;
    await click(row.querySelector('[data-testid="picker-details"]'));
    await settle();
    const detail = document.querySelector('[data-testid="picker-detail"]')!;
    expect(clean(detail.querySelector('.detail-tags'))).toBe('Chest • Strength');
    const facts = [...detail.querySelectorAll('[data-testid="exercise-facts"] .fact')].map((f) => [clean(f.querySelector('dt')), clean(f.querySelector('dd'))]);
    expect(facts).toContainEqual(['Equipment', 'Barbell, bench, rack']);
    expect(facts.find(([label]) => label === 'Muscles')![1]).toContain('Chest');
    // The description is the exercise's own form and breathing cues.
    expect(clean(detail.querySelector('[data-testid="exercise-description"] dd'))).toMatch(/\.\s.+\./);
    // Browsing (no plan day): no sets or reps are suggested.
    expect(detail.querySelector('[data-testid="exercise-prescription"]')).toBeNull();
    expect(detail.querySelector('app-exercise-demo [data-testid="demo-toggle"]')).not.toBeNull();
  });

  it('searches (names, muscles and equipment) and filters by type chip, with a count, an empty state and clear', async () => {
    configure({ premium: false });
    const { el, one, click, settle } = await view(ExercisePickerPage);
    const total = items(el).length;

    const search = one('picker-search') as HTMLInputElement;
    search.value = 'bench';
    search.dispatchEvent(new Event('input'));
    await settle();
    expect(items(el).length).toBeLessThan(total);
    expect(items(el)).toContain('Bench Press');

    await click(one('picker-category-cardio'));
    expect(one('picker-category-cardio')!.getAttribute('aria-checked')).toBe('true');
    expect(one('picker-empty')).not.toBeNull();

    await click(one('picker-clear'));
    expect(items(el)).toHaveLength(total);
    expect(one('picker-category-all')!.getAttribute('aria-checked')).toBe('true');

    await click(one('picker-category-mobility'));
    expect(items(el)).toEqual(expect.arrayContaining(['Bird Dog', 'Dead Bug']));
    expect(items(el)).not.toContain('Bench Press');
  });

  it('for a plan day (step 2): selecting adds to the shared draft, deselecting removes, and Next moves on', async () => {
    const { back, forward } = configure();
    const drafts = TestBed.inject(CustomPlanDraftService);
    await drafts.begin();
    const days = drafts.draft()!;
    const day = days[0].sessionId;
    const picker = await view(ExercisePickerPage, { sessionId: day });
    const { all, one, click } = picker;

    expect(clean(one('picker-title'))).toBe('Add Exercises');
    expect(clean(one('picker-day'))).toMatch(/^Adding to Day 1 – /);
    expect(one('picker-day-0')!.getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('Workout');
    const row = () => all('picker-item').find((r) => clean(r.querySelector('.name')) === 'Hammer Curl')!;
    const toggle = () => row().querySelector<HTMLButtonElement>('[data-testid="picker-toggle"]')!;
    const inDay = () => drafts.draft()![0].exercises.map((e) => e.exerciseId);

    if (inDay().includes('hammer-curl')) {
      await click(toggle());
    }
    const count = inDay().length;
    await click(toggle());
    expect(inDay()).toContain('hammer-curl');
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(clean(one('picker-selected-count'))).toBe(`${count + 1} exercises selected`);
    expect(clean(one('picker-done'))).toBe('Next: Day 2');

    // Next: the following training day, in place; after the last one, the review.
    await click(one('picker-done'));
    expect(forward).not.toHaveBeenCalled();
    expect(clean(one('picker-day'))).toMatch(/^Adding to Day 2 – /);
    expect(one('picker-day-1')!.getAttribute('aria-checked')).toBe('true');
    await click(one(`picker-day-${days.length - 1}`));
    expect(clean(one('picker-done'))).toBe('Review plan');
    await click(one('picker-done'));
    expect(back).toHaveBeenCalledWith('/workout/plan/edit', { queryParams: { step: 'review' } });
    picker.fixture.destroy();

    // The pick is still there when the day is opened again.
    const again = await view(ExercisePickerPage, { sessionId: day });
    expect(again.all('picker-item').find((r) => clean(r.querySelector('.name')) === 'Hammer Curl')!.classList.contains('selected')).toBe(true);
    await again.click(again.all('picker-item').find((r) => clean(r.querySelector('.name')) === 'Hammer Curl')!.querySelector('[data-testid="picker-toggle"]'));
    expect(inDay()).not.toContain('hammer-curl');
    expect(inDay()).toHaveLength(count);
  });

  it('My Plan lists the day in order; removes and reorders with named controls', async () => {
    configure();
    const drafts = TestBed.inject(CustomPlanDraftService);
    await drafts.begin();
    const day = drafts.draft()![0];
    const { el, all, one, click, settle } = await view(ExercisePickerPage, { sessionId: day.sessionId });
    expect(clean(one('picker-view'))).toContain(`My Plan (${day.exercises.length})`);
    await openMyPlan(el, settle);
    const names = () => all('editor-exercise').map((r) => clean(r.querySelector('.name'))!.replace(/^\d+\. /, ''));
    const before = names();
    expect(before).toEqual(day.exercises.map((e) => drafts.catalog.get(e.exerciseId)!.name));
    expect(one('picker-search')).toBeNull(); // the library filters belong to the library view
    expect(all('editor-up')[0].hasAttribute('disabled') || (all('editor-up')[0] as HTMLButtonElement).disabled).toBe(true);

    await click(all('editor-down')[0]);
    expect(names().slice(0, 2)).toEqual([before[1], before[0]]);
    expect(el.querySelector(`[aria-label="Move ${before[0]} up"]`)).not.toBeNull();

    await click(all('editor-remove')[0]);
    expect(drafts.draft()![0].exercises).toHaveLength(day.exercises.length - 1);
    expect(clean(one('picker-selected-count'))).toBe(`${day.exercises.length - 1} exercises selected`);
  });

  it('My Plan edits sets, reps and rest (seconds for timed exercises), with validation messages', async () => {
    configure();
    const drafts = TestBed.inject(CustomPlanDraftService);
    await drafts.begin();
    const day = drafts.draft()![0];
    drafts.add(day.sessionId, drafts.catalog.get('plank')!);
    const { el, all, one, click, type, settle } = await view(ExercisePickerPage, { sessionId: day.sessionId });
    await openMyPlan(el, settle);

    await click(all('editor-exercise-toggle')[0]);
    await type(one('field-sets'), '5');
    expect(clean(all('editor-exercise')[0].querySelector('.summary'))).toMatch(/^5 sets/);
    await type(one('field-sets'), '0');
    expect(clean(one('field-sets'))).toContain('Enter 1–10 sets');
    await type(one('field-sets'), '4');
    expect(clean(one('field-sets'))).not.toContain('Enter 1–10 sets');
    await click(all('editor-exercise-toggle')[0]);

    const plank = all('editor-exercise').find((r) => clean(r.querySelector('.name'))!.endsWith('Plank'))!;
    await click(plank.querySelector('[data-testid="editor-exercise-toggle"]'));
    expect(one('field-seconds')).not.toBeNull();
    expect(one('field-reps-min')).toBeNull();
    await type(one('field-seconds'), '50');
    expect(clean(plank.querySelector('.summary'))).toContain('50 sec');
  });

  it('for a plan day: details show the sets, reps and rest it would be added with, then the ones it has', async () => {
    configure();
    const drafts = TestBed.inject(CustomPlanDraftService);
    await drafts.begin();
    const day = drafts.draft()![0];
    const { all, click, settle } = await view(ExercisePickerPage, { sessionId: day.sessionId });
    const row = all('picker-item').find((r) => !r.classList.contains('selected') && clean(r.querySelector('.name')) === 'Hammer Curl')!;
    await click(row.querySelector('[data-testid="picker-details"]'));
    await settle();
    const prescription = () => document.querySelector('[data-testid="exercise-prescription"]')!;
    expect(clean(prescription().querySelector('h3'))).toBe('Suggested Sets & Reps');
    expect(clean(prescription().querySelector('p'))).toMatch(/^\d+ sets · \d+(–\d+)? reps/);
    expect(clean(document.querySelector('[data-testid="picker-detail-toggle"]'))).toBe('Add to Plan');

    (document.querySelector('[data-testid="picker-detail-toggle"]') as HTMLButtonElement).click();
    await settle();
    expect(drafts.has(day.sessionId, 'hammer-curl')).toBe(true);
    expect(clean(prescription().querySelector('h3'))).toBe('In your plan');
    expect(row.classList.contains('selected')).toBe(true);
  });

  it('the details sheet adds one exercise to several days at once', async () => {
    configure();
    const drafts = TestBed.inject(CustomPlanDraftService);
    await drafts.begin();
    const days = drafts.draft()!;
    for (const d of days) {
      if (drafts.has(d.sessionId, 'hammer-curl')) {
        drafts.remove(d.sessionId, 'hammer-curl');
      }
    }
    const { all, click, settle } = await view(ExercisePickerPage, { sessionId: days[0].sessionId });
    await click(all('picker-item').find((r) => clean(r.querySelector('.name')) === 'Hammer Curl')!.querySelector('[data-testid="picker-details"]'));
    await settle();
    const dayToggle = (i: number) => document.querySelector<HTMLElement>(`[data-testid="picker-add-day-${i}"]`)!;
    dayToggle(0).click();
    dayToggle(1).click();
    await settle();
    expect(drafts.has(days[0].sessionId, 'hammer-curl')).toBe(true);
    expect(drafts.has(days[1].sessionId, 'hammer-curl')).toBe(true);
    expect(dayToggle(1).getAttribute('aria-checked')).toBe('true');
    dayToggle(1).click();
    await settle();
    expect(drafts.has(days[1].sessionId, 'hammer-curl')).toBe(false);
  });

  it('a full day stops accepting exercises', async () => {
    configure();
    const drafts = TestBed.inject(CustomPlanDraftService);
    await drafts.begin();
    const day = drafts.draft()![0].sessionId;
    const { catalog } = drafts;
    for (const exercise of [...catalog.values()]) {
      if (drafts.draft()![0].exercises.length >= 12) {
        break;
      }
      drafts.add(day, exercise);
    }
    const { all } = await view(ExercisePickerPage, { sessionId: day });
    const unselected = all('picker-item').filter((r) => !r.classList.contains('selected'));
    expect(unselected.every((r) => r.querySelector<HTMLButtonElement>('[data-testid="picker-toggle"]')!.disabled)).toBe(true);
    expect(clean(document.body)).toContain('This day is full.');
  });
});

describe('Premium gating', () => {
  const run = () => TestBed.runInInjectionContext(() => requireCustomPlanAccess({} as never, {} as never)) as Promise<boolean | UrlTree>;
  const urlOf = (result: boolean | UrlTree) => (result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result);

  it('without billing (production today) the editor route sends everyone to the offer, which says Premium is unavailable', async () => {
    configure({ premium: false });
    expect(urlOf(await run())).toBe('/offer?next=%2Fworkout');
  });

  it('a verified Premium entitlement opens the editor route', async () => {
    configure({ premium: true });
    expect(await run()).toBe(true);
  });

  it('an unverifiable entitlement (provider error) is Free, never Premium', async () => {
    configure({ premium: false });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: BILLING_PROVIDER, useValue: { ...PREMIUM_TEST_BILLING, activeSubscription: () => Promise.reject(new Error('down')) } }],
    });
    expect(urlOf(await run())).toBe('/offer?next=%2Fworkout');
  });

  it('the routes are registered with the guard (editor and picker), and the library route is not guarded', async () => {
    const { routes } = await import('../../../app.routes');
    const guarded = routes.filter((r) => r.path?.startsWith('workout/plan/edit'));
    expect(guarded.map((r) => r.path)).toEqual(['workout/plan/edit', 'workout/plan/edit/:sessionId/add']);
    for (const route of guarded) {
      expect(route.canActivate).toContain(requireCustomPlanAccess);
    }
    const workoutRoutes = (await import('../workout.routes')).default;
    const library = workoutRoutes.find((r) => r.path === 'exercises');
    expect(library).toBeDefined();
    expect((library as { canActivate?: unknown } | undefined)?.canActivate).toBeUndefined();
  });
});

describe('Workout tab: generated or custom plan', () => {
  it('"Build my own" chosen during setup, on Free: a one-time card that offers Pro and can be dismissed', async () => {
    const { storage, forward } = configure({ premium: false });
    storage.values.set('stokeform.plan-intent', JSON.stringify({ version: 1, intent: 'custom' }));
    const { one, click, all } = await view(WorkoutPage);
    await vi.waitFor(async () => expect(all('plan-actions')).toHaveLength(1));
    await vi.waitFor(() => expect(one('plan-intent')).not.toBeNull());
    expect(clean(one('plan-intent'))).toContain('You wanted to build your own plan');
    await click(one('plan-intent-pro'));
    expect(forward).toHaveBeenCalledWith('/offer', { queryParams: { next: '/workout', start: 'pro' } });
    await click(one('plan-intent-dismiss'));
    expect(one('plan-intent')).toBeNull();
    expect(storage.values.has('stokeform.plan-intent')).toBe(false);
  });

  it('"Build my own" chosen during setup, with Pro: the card opens the editor and is used up', async () => {
    const { storage, forward } = configure({ premium: true });
    storage.values.set('stokeform.plan-intent', JSON.stringify({ version: 1, intent: 'custom' }));
    const { one, click, all } = await view(WorkoutPage);
    await vi.waitFor(async () => expect(all('plan-actions')).toHaveLength(1));
    await vi.waitFor(() => expect(one('plan-intent-build')).not.toBeNull());
    await click(one('plan-intent-build'));
    expect(forward).toHaveBeenCalledWith('/workout/plan/edit');
    expect(one('plan-intent')).toBeNull();
  });

  it('no card without that choice', async () => {
    configure({ premium: false });
    const { one, all } = await view(WorkoutPage);
    await vi.waitFor(async () => expect(all('plan-actions')).toHaveLength(1));
    expect(one('plan-intent')).toBeNull();
  });

  it('Free default: a generated plan, "Build my own" labelled Pro with an honest note; the library is one tap away', async () => {
    const { forward } = configure({ premium: false });
    const { one, click, all } = await view(WorkoutPage);
    await vi.waitFor(async () => expect(all('plan-actions')).toHaveLength(1));
    expect(clean(document.body)).toContain('Generated plan');
    expect(clean(one('plan-premium-note'))).toContain('Pro Choose your own exercises and edit your plan.');
    expect(clean(one('plan-build'))).toBe('Build my own');

    await click(one('plan-browse'));
    expect(forward).toHaveBeenCalledWith('/workout/exercises');
    // "Build my own" explains the Pro feature first; it never opens the editor without access.
    await click(one('plan-build'));
    expect(forward).not.toHaveBeenCalledWith('/workout/plan/edit');
    const gate = document.querySelector('[data-testid="pro-gate"]')!;
    expect(clean(gate)).toContain('The custom workout plan editor is available with StokeForm Pro.');
    (document.querySelector('[data-testid="pro-gate-see"]') as HTMLButtonElement).click();
    // The sheet closes first, then the plan screen opens.
    await vi.waitFor(() => expect(forward).toHaveBeenCalledWith('/offer', { queryParams: { next: '/workout' } }));
  });

  it('with Pro test access, "Build my own" opens the editor directly', async () => {
    const { forward } = configure({ premium: false });
    await TestBed.inject(PrivateTestingService).redeem('STOKEFORMLAB');
    const { one, click, all } = await view(WorkoutPage);
    await vi.waitFor(async () => expect(all('plan-actions')).toHaveLength(1));
    expect(one('plan-premium-note')).toBeNull();
    await click(one('plan-build'));
    expect(forward).toHaveBeenCalledWith('/workout/plan/edit');
  });

  it('shows a plan saved in the editor when the tab is shown again, without switching tabs', async () => {
    configure({ premium: true });
    const plans = TestBed.inject(WorkoutPlanService);
    const state = await plans.load();
    const { one, all } = await view(WorkoutPage);
    await vi.waitFor(async () => expect(all('plan-actions')).toHaveLength(1));
    expect(one('plan-build')).not.toBeNull();
    expect(one('plan-edit')).toBeNull();

    // The editor (a full-screen route on top of this tab) saves; Ionic doesn't re-enter the tab's page.
    const spec = (await import('../../../domain/training-plan')).customSpecFromPlan((state as { plan: WorkoutPlan }).plan);
    expect((await plans.saveCustomPlan(spec)).kind).toBe('saved');
    await vi.waitFor(() => expect(one('plan-edit')).not.toBeNull());
    expect(one('plan-build')).toBeNull();
    expect(clean(document.body)).toContain('Custom plan');
  });

  it('Premium: no Premium note; a saved custom plan is labelled and offers Edit and a confirmed way back', async () => {
    configure({ premium: true });
    const plans = TestBed.inject(WorkoutPlanService);
    const state = await plans.load();
    const spec = (await import('../../../domain/training-plan')).customSpecFromPlan((state as { plan: WorkoutPlan }).plan);
    expect((await plans.saveCustomPlan(spec)).kind).toBe('saved');

    const { one, click, all } = await view(WorkoutPage);
    await vi.waitFor(async () => expect(all('plan-actions')).toHaveLength(1));
    expect(clean(document.body)).toContain('Custom plan');
    expect(one('plan-premium-note')).toBeNull();
    expect(clean(one('plan-edit'))).toBe('Edit my plan');

    await click(one('plan-use-generated'));
    expect(document.querySelector('[data-testid="switch-confirm"]')).not.toBeNull();
    await click(document.querySelector('[data-testid="switch-keep"]'));
    expect((await plans.load() as { plan: WorkoutPlan }).plan.custom).toBeDefined();
  });
});
