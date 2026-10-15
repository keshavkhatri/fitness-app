import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { By } from '@angular/platform-browser';
import { RouterTestingHarness } from '@angular/router/testing';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { WorkoutLogService } from '../../core/workout/workout-log.service';
import { WorkoutPlanRepository } from '../../core/workout/workout-plan.repository';
import { WorkoutPlanService } from '../../core/workout/workout-plan.service';
import { WORKOUT_PROGRAMMING_CONFIG } from '../../core/workout/workout-programming-config.token';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { DEFAULT_WORKOUT_CONFIG, EXERCISE_LIBRARY, WorkoutPlan, WorkoutSession } from '../../domain/workout-programming';
import { BottomSheetComponent } from '../../shared/ui';
import { ACTIVITY_PROFILE, HOME_PROFILE, PROFILE, THURSDAY, planFor } from './testing/workout-fixtures';
import { WorkoutDetailPage } from './workout-detail.page';

interface OpenOptions {
  profile?: UserFitnessProfile;
  storedPlan?: WorkoutPlan;
  brokenEngine?: boolean;
  before?: () => void;
}

const PLAN_KEY = 'fitness.workout-plan';

async function open(url: string, { profile = PROFILE, storedPlan, brokenEngine = false, before }: OpenOptions = {}) {
  const storage = new MemoryKeyValueStorage();
  storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile }));
  if (storedPlan) {
    storage.values.set(PLAN_KEY, JSON.stringify({ version: 1, plan: storedPlan }));
  }
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      // The feature's real routes, with route params bound to component inputs as in the app.
      provideRouter([{ path: 'workout', loadChildren: () => import('./workout.routes') }], withComponentInputBinding()),
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => THURSDAY },
      ...(brokenEngine ? [{ provide: WORKOUT_PROGRAMMING_CONFIG, useValue: { ...DEFAULT_WORKOUT_CONFIG, version: 'v0' as never } }] : []),
    ],
  });
  before?.();
  const back = vi.spyOn(TestBed.inject(NavController), 'navigateBack').mockResolvedValue(true);
  const forward = vi.spyOn(TestBed.inject(NavController), 'navigateForward').mockResolvedValue(true);
  const save = vi.spyOn(TestBed.inject(WorkoutPlanRepository), 'save');

  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, WorkoutDetailPage);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
  await harness.fixture.whenStable();
  harness.detectChanges();
  const el = harness.routeNativeElement as HTMLElement;

  const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();
  const text = (testId: string) => clean(el.querySelector(`[data-testid="${testId}"]`));
  const all = (testId: string) => [...el.querySelectorAll(`[data-testid="${testId}"]`)];
  const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('button')];
  const button = (label: string) => buttons().find((b) => clean(b) === label);
  const settle = async () => {
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  const exerciseNames = () => all('detail-exercise').map((e) => clean(e.querySelector('.name'))?.replace(/^\d+\. /, ''));

  return { harness, el, storage, back, forward, save, navigate, clean, text, all, buttons, button, settle, exerciseNames };
}

const catalogNames = (session: WorkoutSession) =>
  session.exercises.map((e) => EXERCISE_LIBRARY.find((x) => x.id === e.exerciseId)!.name);

describe('WorkoutDetailPage', () => {
  describe('ready: resistance session', () => {
    it('renders the session the route id points to, in full and in programmed order', async () => {
      const plan = planFor();
      const { el, text, all, clean, exerciseNames } = await open('/workout/session/day-3-upper', { storedPlan: plan });

      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Upper Body B');
      expect(text('day-label')).toBe('Thursday · Today');
      expect([...el.querySelectorAll('[data-testid="session-meta"] li')].map((li) => clean(li))).toEqual(['About 50 min', '7 exercises']);
      expect(el.querySelector('[data-testid="session-focus"]')?.getAttribute('aria-label')).toBe('Focus');
      expect([...el.querySelectorAll('[data-testid="session-focus"] li')].map((li) => li.textContent?.trim())).toEqual(['Chest', 'Back', 'Shoulders', 'Arms']);
      expect(clean(all('detail-exercise')[0].querySelector('.brief'))).toBe('4 sets · 6–10 reps');
      expect(exerciseNames()).toEqual(catalogNames(plan.sessions[2] as WorkoutSession));

      const firstStats = [...all('detail-stats')[0].querySelectorAll('.stat')].map((s) => [
        s.querySelector('dd')?.textContent?.trim(),
        s.querySelector('dt [aria-hidden="true"]')?.textContent?.trim(),
      ]);
      expect(firstStats).toEqual([
        ['4', 'sets'],
        ['6–10', 'reps'],
        ['120 sec', 'rest'],
      ]);
      expect(text('progression')).toContain('increase the load by about 5%');
    });

    it('resolves sessions by id even when display names are duplicated', async () => {
      const plan = planFor();
      const sessions = plan.sessions as WorkoutSession[];
      const duplicated: WorkoutPlan = {
        ...plan,
        sessions: sessions.map((s) => (s.id === 'day-3-upper' ? { ...s, variant: 'A', name: 'Upper A' } : s)),
      };
      const third = await open('/workout/session/day-3-upper', { storedPlan: duplicated });
      expect(third.el.querySelector('h1')?.textContent?.trim()).toBe('Upper Body A');
      expect(third.exerciseNames()).toEqual(catalogNames(sessions[2]));

      TestBed.resetTestingModule();
      const first = await open('/workout/session/day-1-upper', { storedPlan: duplicated });
      expect(first.el.querySelector('h1')?.textContent?.trim()).toBe('Upper Body A');
      expect(first.exerciseNames()).toEqual(catalogNames(sessions[0]));
      expect(first.exerciseNames()).not.toEqual(third.exerciseNames());
    });

    it('uses the current stored plan; the page never generates or saves a second plan', async () => {
      // A stored plan with an earlier generation date: regenerating would replace it.
      const stored = { ...planFor(), generatedAt: '2026-09-01' };
      const { storage, save, el } = await open('/workout/session/day-1-upper', { storedPlan: stored });
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Upper Body A');
      expect(save).not.toHaveBeenCalled();
      expect(JSON.parse(storage.values.get(PLAN_KEY)!).plan.generatedAt).toBe('2026-09-01');
    });

    it('with no stored plan, the shared service creates the plan once (not the page)', async () => {
      const load = vi.fn();
      const { save, el } = await open('/workout/session/day-3-upper', {
        before: () => {
          const service = TestBed.inject(WorkoutPlanService);
          const original = service.load.bind(service);
          vi.spyOn(service, 'load').mockImplementation(() => {
            load();
            return original();
          });
        },
      });
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Upper Body B');
      expect(load).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('shows a concise substitution note only where the plan reports a substitute', async () => {
      const plan = planFor(HOME_PROFILE);
      const { all, el } = await open(`/workout/session/${plan.sessions[0].id}`, { profile: HOME_PROFILE, storedPlan: plan });
      const notes = all('substitution');
      expect(notes).toHaveLength((plan.sessions[0] as WorkoutSession).exercises.filter((e) => e.selection.substitute).length);
      expect(notes[0].textContent?.replace(/\s+/g, ' ').trim()).toBe('Modified exercise. A substitute chosen for your available equipment.');
      expect(el.textContent).not.toMatch(/scapular|objective|substituteClass/);
    });

    it('Start Workout starts a workout log from this session and opens Active Workout; the plan is unchanged', async () => {
      const { button, settle, forward, storage } = await open('/workout/session/day-3-upper');
      const planBefore = storage.values.get(PLAN_KEY);
      button('Start workout')!.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/workout', 'session', 'day-3-upper', 'active']);
      const active = JSON.parse(storage.values.get('fitness.workout-active')!).log;
      expect(active).toMatchObject({ status: 'in-progress', source: { sessionId: 'day-3-upper' } });
      expect(storage.values.get(PLAN_KEY)).toBe(planBefore);
    });

    it('shows Resume workout when this session is already in progress', async () => {
      const { button, settle, forward } = await open('/workout/session/day-3-upper', {
        before: () => void TestBed.inject(WorkoutLogService).start('day-3-upper'),
      });
      expect(button('Start workout')).toBeUndefined();
      button('Resume workout')!.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/workout', 'session', 'day-3-upper', 'active']);
    });

    it('one workout at a time: another in-progress workout opens a conflict choice', async () => {
      const { harness, button, settle, forward, storage } = await open('/workout/session/day-3-upper', {
        before: () => void TestBed.inject(WorkoutLogService).start('day-1-upper'),
      });
      button('Start workout')!.click();
      await settle();
      expect(forward).not.toHaveBeenCalled();
      const sheet = harness.fixture.debugElement.query(By.directive(BottomSheetComponent)).componentInstance as BottomSheetComponent;
      expect(sheet.open()).toBe(true);
      expect(sheet.title()).toBe('Another workout is in progress');
      expect(sheet.description()).toBe('Upper Body A is still in progress. Resume it, or discard it to start this workout.');
      expect(TestBed.inject(WorkoutLogService).active()?.source.sessionId).toBe('day-1-upper');
      expect(JSON.parse(storage.values.get('fitness.workout-active')!).log.source.sessionId).toBe('day-1-upper');
    });
  });

  describe('activity and rest', () => {
    it('renders an activity session as an activity (no exercise list)', async () => {
      const { el, text, all, button } = await open('/workout/session/day-4-light-activity', { profile: ACTIVITY_PROFILE });
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Light Activity');
      expect([...el.querySelectorAll('[data-testid="session-meta"] li')].map((li) => li.textContent?.trim())).toEqual([
        'Recovery',
        '20–30 min',
        'Easy pace',
      ]);
      expect(text('activity-guidance')).toContain('Walking, easy cycling or mobility work.');
      expect(all('detail-exercise')).toHaveLength(0);
      expect(button('Start workout')).toBeUndefined();
      expect(button('Start activity')).toBeDefined();
    });

    it('activity sessions never start the resistance logger', async () => {
      const { button, text, settle, forward, storage } = await open('/workout/session/day-4-light-activity', { profile: ACTIVITY_PROFILE });
      button('Start activity')!.click();
      await settle();
      expect(text('start-status')).toBe('Activity tracking arrives in a later update. Nothing has been started or recorded.');
      expect(forward).not.toHaveBeenCalled();
      expect(storage.values.has('fitness.workout-active')).toBe(false);
    });

    it('defensive rest route: a calm rest view, no start action', async () => {
      const { el, text, button, back, settle } = await open('/workout/session/rest-wed');
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Rest day');
      expect(text('rest')).toContain('There is no workout scheduled for this day.');
      expect(button('Start workout')).toBeUndefined();
      expect(el.querySelector('ion-footer')).toBeNull();
      button('Back to workout')!.click();
      await settle();
      expect(back).toHaveBeenCalledWith('/workout');
    });
  });

  describe('not found / unavailable / loading', () => {
    it.each([
      ['an unknown session id', '/workout/session/day-9-legs'],
      ['a display name instead of an id', '/workout/session/Upper%20Body%20B'],
      ['a rest id for a training day', '/workout/session/rest-mon'],
    ])('not found for %s, with a way back', async (_, url) => {
      const { text, button, back, settle, el } = await open(url);
      expect(text('not-found')).toContain('Workout not found');
      expect(text('not-found')).toContain('This session is no longer available in your current plan.');
      expect(text('announcement')).toBe('Workout not found');
      expect(el.querySelectorAll('h1')).toHaveLength(1);
      button('Back to workout')!.click();
      await settle();
      expect(back).toHaveBeenCalledWith('/workout');
    });

    it('unavailable plan: friendly error, retry and back; no raw errors', async () => {
      const { el, text, button, back, settle } = await open('/workout/session/day-3-upper', { brokenEngine: true });
      expect(text('unavailable')).toContain("Couldn't load this workout");
      expect(text('announcement')).toBe("Couldn't load this workout");
      expect(el.textContent).not.toMatch(/invalid-configuration|Unknown version/);

      const load = vi.spyOn(TestBed.inject(WorkoutPlanService), 'load');
      button('Try again')!.click();
      await settle();
      expect(load).toHaveBeenCalledTimes(1);

      button('Back to workout')!.click();
      await settle();
      expect(back).toHaveBeenCalledWith('/workout');
    });

    it('a failing service is shown as unavailable', async () => {
      const { text } = await open('/workout/session/day-3-upper', {
        before: () => vi.spyOn(TestBed.inject(WorkoutPlanService), 'load').mockRejectedValue(new Error('boom')),
      });
      expect(text('unavailable')).toContain("Couldn't load this workout");
    });

    it('loading: skeletons, aria-busy and a status announcement', () => {
      // Rendered directly: a never-settling load would keep the router harness from becoming stable.
      TestBed.configureTestingModule({
        providers: [provideIonicAngular(), provideRouter([]), { provide: KeyValueStorage, useValue: new MemoryKeyValueStorage() }],
      });
      vi.spyOn(TestBed.inject(WorkoutPlanService), 'load').mockReturnValue(new Promise(() => undefined));
      const fixture = TestBed.createComponent(WorkoutDetailPage);
      fixture.componentRef.setInput('sessionId', 'day-3-upper');
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="loading"]')?.getAttribute('aria-busy')).toBe('true');
      expect(el.querySelector('[data-testid="announcement"]')?.textContent?.trim()).toBe('Loading workout');
      expect(el.querySelectorAll('h1')).toHaveLength(1);
    });
  });

  describe('navigation and accessibility', () => {
    it('has a labelled back button that returns to /workout by default', async () => {
      const { el } = await open('/workout/session/day-3-upper');
      const backButton = el.querySelector('ion-back-button') as HTMLElement & { defaultHref?: string; text?: string };
      expect(backButton.defaultHref).toBe('/workout');
      expect(backButton.getAttribute('aria-label')).toBe('Back');
    });

    it('one h1, then section h2s and numbered exercise h3s', async () => {
      const { el } = await open('/workout/session/day-3-upper');
      // As read aloud: without aria-hidden parts (the visual order badge).
      const spoken = (h: Element) => {
        const copy = h.cloneNode(true) as Element;
        copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
        return copy.textContent?.replace(/\s+/g, ' ').trim();
      };
      const headings = [...el.querySelectorAll('h1, h2, h3')].map((h) => `${h.tagName}:${spoken(h)}`);
      expect(headings.filter((h) => h.startsWith('H1'))).toEqual(['H1:Upper Body B']);
      expect(headings.filter((h) => h.startsWith('H2'))).toEqual(['H2:Exercises (7)', 'H2:Progression']);
      expect(headings.filter((h) => h.startsWith('H3'))[0]).toBe('H3:1. Bench Press 4 sets · 6–10 reps');
      const levels = headings.map((h) => Number(h[1]));
      levels.forEach((level, i) => i > 0 && expect(level - levels[i - 1]).toBeLessThanOrEqual(1));
    });

    it('an exercise row opens in place to its full prescription and closes again', async () => {
      const { el, all, settle } = await open('/workout/session/day-3-upper');
      const first = all('detail-exercise')[0];
      const toggle = first.querySelector<HTMLButtonElement>('[data-testid="detail-exercise-toggle"]')!;
      const more = el.querySelector<HTMLElement>(`#${toggle.getAttribute('aria-controls')}`)!;
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(more.hidden).toBe(true);
      toggle.click();
      await settle();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(more.hidden).toBe(false);
      expect(more.textContent).toContain('Chest · Barbell, bench, rack');
      toggle.click();
      await settle();
      expect(more.hidden).toBe(true);
    });

    it('prescriptions are a definition list with spoken labels (per side read as "per side")', async () => {
      // The intermediate gym plan’s lower days include per-side work (split squats, lunges).
      const plan = planFor(PROFILE);
      const session = (plan.sessions as WorkoutSession[]).find((s) => s.kind === 'resistance' && s.exercises.some((e) => e.notes.includes('per-side')))!;
      const { el } = await open(`/workout/session/${session.id}`, { storedPlan: plan });
      const spoken = [...el.querySelectorAll('[data-testid="detail-stats"] dt .visually-hidden')].map((s) => s.textContent?.trim());
      expect(spoken).toContain('reps per side');
      expect(el.querySelector('[data-testid="detail-stats"]')?.tagName).toBe('DL');
    });

    it('every button has an accessible name and explicit type, in every state', async () => {
      for (const [url, options] of [
        ['/workout/session/day-3-upper', {}],
        ['/workout/session/day-4-light-activity', { profile: ACTIVITY_PROFILE }],
        ['/workout/session/rest-wed', {}],
        ['/workout/session/missing', {}],
      ] as const) {
        TestBed.resetTestingModule();
        const { buttons, clean } = await open(url, options);
        expect(buttons().length).toBeGreaterThan(0);
        for (const b of buttons()) {
          expect(clean(b) || b.getAttribute('aria-label'), b.outerHTML.slice(0, 80)).toBeTruthy();
          expect(b.getAttribute('type')).toBe('button');
        }
      }
    });
  });
});
