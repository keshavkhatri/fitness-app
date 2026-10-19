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

describe('Custom plan editor', () => {
  const names = (el: HTMLElement) => [...el.querySelectorAll('[data-testid="editor-exercise"] .name')].map((n) => clean(n));

  it('opens on the active plan: one section per training day with its exercises, nothing changed yet', async () => {
    const { storage } = configure();
    const { el, all, one } = await view(CustomPlanEditorPage);
    expect(clean(one('editor-title'))).toBe('Build your plan');
    const plan = (await TestBed.inject(WorkoutPlanService).load()) as { plan: WorkoutPlan };
    const days = plan.plan.sessions.filter((s): s is WorkoutSession => s.kind === 'resistance');
    expect(all('editor-day')).toHaveLength(days.length);
    expect(names(el)).toHaveLength(days.reduce((n, s) => n + s.exercises.length, 0));
    expect(clean(all('editor-day')[0].querySelector('h2'))).toMatch(/^Day 1 · /);
    expect(storedPlan(storage).custom).toBeUndefined();
  });

  it('removes and reorders exercises, announced with named controls', async () => {
    configure();
    const { el, all, click, fixture } = await view(CustomPlanEditorPage);
    const day = all('editor-day')[0];
    const before = [...day.querySelectorAll('[data-testid="editor-exercise"] .name')].map(clean);
    expect(day.querySelector<HTMLButtonElement>('[data-testid="editor-up"]')!.disabled).toBe(true);

    await click(day.querySelector('[data-testid="editor-down"]'));
    const moved = [...all('editor-day')[0].querySelectorAll('[data-testid="editor-exercise"] .name')].map(clean);
    expect(moved.slice(0, 2)).toEqual([before[1], before[0]]);
    expect(el.querySelector(`[aria-label="Move ${before[0]} up"]`)).not.toBeNull();

    await click(all('editor-day')[0].querySelector('[data-testid="editor-remove"]'));
    const removed = [...all('editor-day')[0].querySelectorAll('[data-testid="editor-exercise"] .name')].map(clean);
    expect(removed).toEqual(moved.slice(1));
    fixture.destroy();
  });

  it('edits sets, reps and rest, and shows the validation message for a wrong value', async () => {
    configure();
    const { all, one, click, type } = await view(CustomPlanEditorPage);
    await click(all('editor-exercise-toggle')[0]);
    await type(one('field-sets'), '5');
    expect(clean(all('editor-exercise')[0].querySelector('.summary'))).toMatch(/^5 sets/);

    await type(one('field-sets'), '0');
    expect(clean(one('field-sets'))).toContain('Enter 1–10 sets');
    await type(one('field-sets'), '4');
    expect(clean(one('field-sets'))).not.toContain('Enter 1–10 sets');
  });

  it('timed exercises are edited in seconds, not reps', async () => {
    configure();
    const drafts = TestBed.inject(CustomPlanDraftService);
    const { all, one, click, type, settle } = await view(CustomPlanEditorPage);
    const plank = drafts.catalog.get('plank')!;
    drafts.add(drafts.draft()![0].sessionId, plank);
    await settle();
    const rows = all('editor-exercise');
    const row = rows.find((r) => clean(r.querySelector('.name')) === 'Plank')!;
    await click(row.querySelector('[data-testid="editor-exercise-toggle"]'));
    expect(one('field-seconds')).not.toBeNull();
    expect(one('field-reps-min')).toBeNull();
    await type(one('field-seconds'), '50');
    expect(clean(row.querySelector('.summary'))).toContain('50 sec');
  });

  it('Add exercises goes to the picker for that day', async () => {
    const { forward } = configure();
    const { all, click } = await view(CustomPlanEditorPage);
    const day = (TestBed.inject(CustomPlanDraftService).draft() ?? [])[1].sessionId;
    await click(all('editor-add')[1]);
    expect(forward).toHaveBeenCalledWith(['/workout', 'plan', 'edit', day, 'add']);
  });

  it('an empty day or an invalid field blocks saving and says why; the plan is not replaced', async () => {
    const { storage } = configure();
    const { all, one, click } = await view(CustomPlanEditorPage);
    const day = all('editor-day')[0];
    while (all('editor-day')[0].querySelector('[data-testid="editor-remove"]')) {
      await click(all('editor-day')[0].querySelector('[data-testid="editor-remove"]'));
    }
    expect(clean(day.querySelector('[data-testid="editor-day-problem"]'))).toBe('Add at least one exercise.');

    await click(one('editor-review'));
    const review = document.querySelector('[data-testid="review"]')!;
    expect(clean(review.querySelector('[data-testid="review-problems"]'))).toContain('Add at least one exercise');
    expect((review.querySelector('[data-testid="review-save"]') as HTMLButtonElement).disabled).toBe(true);
    expect(storedPlan(storage).custom).toBeUndefined();
  });

  it('review summarizes the plan; saving replaces the active plan, persists it and leaves the editor', async () => {
    const { storage, back } = configure();
    const { all, one, click, settle } = await view(CustomPlanEditorPage);
    await click(all('editor-remove')[0]);
    await click(one('editor-review'));

    const review = document.querySelector('[data-testid="review"]')!;
    expect(clean(review)).toContain('This replaces your current plan.');
    expect(clean(review)).toMatch(/\d+ exercises · \d+ sets/);
    const reviewed = [...review.querySelectorAll('.review-name')].map(clean);

    (review.querySelector('[data-testid="review-save"]') as HTMLButtonElement).click();
    await settle();
    await vi.waitFor(() => expect(back).toHaveBeenCalledWith('/workout'));

    const saved = storedPlan(storage);
    expect(saved.custom).toEqual({ editedAt: '2026-10-08' });
    expect(saved.sessions.flatMap((s) => s.exercises.map((e) => TestBed.inject(CustomPlanDraftService).catalog.get(e.exerciseId)!.name))).toEqual(reviewed);
    expect(TestBed.inject(CustomPlanDraftService).draft()).toBeNull();
  });

  it('editing the saved custom plan later starts from it and is titled "Edit your plan"', async () => {
    configure();
    const first = await view(CustomPlanEditorPage);
    await first.click(first.all('editor-remove')[0]);
    const savedNames = names(first.el);
    await first.click(first.one('editor-review'));
    (document.querySelector('[data-testid="review-save"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(TestBed.inject(CustomPlanDraftService).draft()).toBeNull());
    first.fixture.destroy();

    const second = await view(CustomPlanEditorPage);
    expect(clean(second.one('editor-title'))).toBe('Edit your plan');
    expect(names(second.el)).toEqual(savedNames);
  });

  it('Cancel with no changes leaves at once; with changes it asks first, and discarding never replaces the plan', async () => {
    const { storage, back } = configure();
    const { one, click } = await view(CustomPlanEditorPage);
    const before = storage.values.get(PLAN_KEY);

    await click(one('editor-cancel'));
    expect(back).toHaveBeenCalledWith('/workout');
    back.mockClear();

    const next = await view(CustomPlanEditorPage);
    await next.click(next.all('editor-remove')[0]);
    await next.click(next.one('editor-cancel'));
    expect(back).not.toHaveBeenCalled();
    const sheet = document.querySelector('[data-testid="discard-confirm"]') as HTMLElement;
    expect(sheet).not.toBeNull();
    await next.click(sheet);
    expect(back).toHaveBeenCalledWith('/workout');
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

    const edited = await view(CustomPlanEditorPage);
    await edited.click(edited.all('editor-remove')[0]);
    const before = storage.values.get(PLAN_KEY);
    pressHardwareBack();
    await edited.settle();
    expect(back).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="discard-confirm"]')).not.toBeNull();
    expect(TestBed.inject(CustomPlanDraftService).dirty()).toBe(true);
    expect(storage.values.get(PLAN_KEY)).toBe(before);
  });

  it('Android Back is left to the exercise picker while it is on top of the editor', async () => {
    const { back } = configure();
    const editor = await view(CustomPlanEditorPage);
    await editor.click(editor.all('editor-remove')[0]);
    (editor.fixture.nativeElement as HTMLElement).classList.add('ion-page-hidden');
    // The editor's own handler (priority 10) passes Back along instead of acting.
    const next = pressHardwareBack(10);
    expect(next).toHaveBeenCalledOnce();
    expect(back).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="discard-confirm"]')).toBeNull();
  });

  it('a failed write keeps the editor open with the draft and an honest message; the active plan is unchanged', async () => {
    const { storage, back } = configure();
    const { all, one, click, settle } = await view(CustomPlanEditorPage);
    await click(all('editor-remove')[0]);
    const before = storage.values.get(PLAN_KEY);
    await click(one('editor-review'));
    storage.failWrites = true;
    (document.querySelector('[data-testid="review-save"]') as HTMLButtonElement).click();
    await settle();
    await vi.waitFor(() => expect(clean(document.querySelector('[data-testid="review-message"]'))).toContain("Couldn't save your plan"));
    storage.failWrites = false;
    expect(back).not.toHaveBeenCalled();
    expect(storage.values.get(PLAN_KEY)).toBe(before);
    expect(TestBed.inject(CustomPlanDraftService).dirty()).toBe(true);
  });
});

describe('Exercise picker and library', () => {
  const items = (el: HTMLElement) => [...el.querySelectorAll('[data-testid="picker-item"] .name')].map(clean);

  it('browsing (no plan day) lists the whole catalog with details only; this is the Free library', async () => {
    configure({ premium: false });
    const { el, all, one } = await view(ExercisePickerPage);
    expect(clean(one('picker-title'))).toBe('Exercise library');
    expect(all('picker-item').length).toBeGreaterThan(40);
    expect(all('picker-toggle')).toHaveLength(0);
    expect(one('picker-done')).toBeNull();
    expect(clean(one('picker-count'))).toMatch(/^\d+ exercises$/);
    expect(items(el)).toContain('Bench Press');
    // Every exercise says what it needs, including none.
    const pushUp = all('picker-item').find((r) => clean(r.querySelector('.name')) === 'Push-Up')!;
    expect(clean(pushUp)).toContain('Equipment: Bodyweight');
  });

  it('opens an exercise’s details: muscles, equipment and the existing demonstration', async () => {
    configure({ premium: false });
    const { all, click, settle } = await view(ExercisePickerPage);
    const row = all('picker-item').find((r) => clean(r.querySelector('.name')) === 'Bench Press')!;
    await click(row.querySelector('[data-testid="picker-details"]'));
    await settle();
    const detail = document.querySelector('[data-testid="picker-detail"]')!;
    expect(clean(detail)).toContain('Chest');
    // Equipment is its own labelled line, not mixed into the muscles.
    expect(clean(detail)).toContain('Equipment: Barbell, bench, rack');
    expect(clean(row)).toContain('Equipment: Barbell, bench, rack');
    expect(clean(row.querySelectorAll('.meta')[0])).toBe('Chest');
    expect(detail.querySelector('app-exercise-demo [data-testid="demo-toggle"]')).not.toBeNull();
  });

  it('searches and filters by muscle and equipment, with a count, an empty state and clear', async () => {
    configure({ premium: false });
    const { el, one, click, settle } = await view(ExercisePickerPage);
    const total = items(el).length;

    const search = one('picker-search') as HTMLInputElement;
    search.value = 'bench';
    search.dispatchEvent(new Event('input'));
    await settle();
    expect(items(el).length).toBeLessThan(total);
    expect(items(el).every((n) => /bench/i.test(n!))).toBe(true);

    const equipment = one('picker-equipment') as HTMLSelectElement;
    equipment.value = 'dumbbells';
    equipment.dispatchEvent(new Event('change'));
    await settle();
    expect(items(el)).toContain('Dumbbell Bench Press');
    expect(items(el)).not.toContain('Bench Press');

    const muscle = one('picker-muscle') as HTMLSelectElement;
    muscle.value = 'quads';
    muscle.dispatchEvent(new Event('change'));
    await settle();
    expect(one('picker-empty')).not.toBeNull();

    await click(one('picker-clear'));
    expect(items(el)).toHaveLength(total);
    expect(one('picker-clear')).toBeNull();
  });

  it('for a plan day: selecting adds to the shared draft, deselecting removes, and the selection survives leaving and returning', async () => {
    const { back } = configure();
    const drafts = TestBed.inject(CustomPlanDraftService);
    await drafts.begin();
    const day = drafts.draft()![0].sessionId;
    const picker = await view(ExercisePickerPage, { sessionId: day });
    const { all, one, click } = picker;

    expect(clean(one('picker-title'))).toMatch(/^Add to /);
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
    expect(clean(one('picker-done'))).toBe(`Done · ${count + 1} in this day`);

    // Leave for the editor and come back: the pick is still there.
    await click(one('picker-done'));
    expect(back).toHaveBeenCalledWith('/workout/plan/edit');
    picker.fixture.destroy();
    const editor = await view(CustomPlanEditorPage);
    expect(editor.all('editor-day')[0].textContent).toContain('Hammer Curl');
    const again = await view(ExercisePickerPage, { sessionId: day });
    expect(again.all('picker-item').find((r) => clean(r.querySelector('.name')) === 'Hammer Curl')!.classList.contains('selected')).toBe(true);

    await again.click(again.all('picker-item').find((r) => clean(r.querySelector('.name')) === 'Hammer Curl')!.querySelector('[data-testid="picker-toggle"]'));
    expect(inDay()).not.toContain('hammer-curl');
    expect(inDay()).toHaveLength(count);
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
  it('Free default: a generated plan, "Build my own" labelled Premium with an honest note; the library is one tap away', async () => {
    const { forward } = configure({ premium: false });
    const { one, click, all } = await view(WorkoutPage);
    await vi.waitFor(async () => expect(all('plan-actions')).toHaveLength(1));
    expect(clean(document.body)).toContain('Generated plan');
    expect(clean(one('plan-premium-note'))).toContain('Premium: choose your own exercises and edit your plan.');
    expect(clean(one('plan-build'))).toBe('Build my own');

    await click(one('plan-browse'));
    expect(forward).toHaveBeenCalledWith('/workout/exercises');
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
