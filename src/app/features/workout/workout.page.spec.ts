import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { ONBOARDING_PATH, ONBOARDING_REVIEW_PATH } from '../../core/profile/onboarding.guards';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { WorkoutLogService } from '../../core/workout/workout-log.service';
import { WorkoutPlanService } from '../../core/workout/workout-plan.service';
import { WORKOUT_PROGRAMMING_CONFIG } from '../../core/workout/workout-programming-config.token';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { DEFAULT_WORKOUT_CONFIG, WorkoutPlan } from '../../domain/workout-programming';
import { WorkoutLog } from '../../domain/workout-session';
import { finishedLog } from '../../domain/workout-session/testing/workout-log-fixtures';
import { ACTIVITY_PROFILE, HOME_PROFILE, MONDAY, PROFILE, REST_PROFILE, THURSDAY, planFor, profileWith } from './testing/workout-fixtures';
import { WorkoutPage } from './workout.page';

interface SetupOptions {
  profile?: UserFitnessProfile | null;
  storedPlan?: WorkoutPlan;
  today?: Date;
  failWrites?: boolean;
  /** Starts a workout for this session before rendering. */
  activeSession?: string;
  /** Finished workouts already on the device. */
  history?: readonly WorkoutLog[];
  /** An invalid config makes the engine refuse to generate ("unavailable"). */
  brokenEngine?: boolean;
}

async function render({ profile = PROFILE, storedPlan, today = THURSDAY, failWrites = false, brokenEngine = false, activeSession, history }: SetupOptions = {}) {
  const storage = new MemoryKeyValueStorage();
  if (profile) {
    storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile }));
  }
  if (storedPlan) {
    storage.values.set('fitness.workout-plan', JSON.stringify({ version: 1, plan: storedPlan }));
  }
  if (history?.length) {
    storage.values.set('fitness.workout-logs', JSON.stringify({ version: 1, logs: history }));
  }
  storage.failWrites = failWrites;
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => today },
      ...(brokenEngine ? [{ provide: WORKOUT_PROGRAMMING_CONFIG, useValue: { ...DEFAULT_WORKOUT_CONFIG, version: 'v0' as never } }] : []),
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const forward = vi.spyOn(TestBed.inject(NavController), 'navigateForward').mockResolvedValue(true);
  if (activeSession) {
    await TestBed.inject(WorkoutLogService).start(activeSession);
  }

  const fixture = TestBed.createComponent(WorkoutPage);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();
  const text = (testId: string) => clean(el.querySelector(`[data-testid="${testId}"]`));
  const all = (testId: string) => [...el.querySelectorAll(`[data-testid="${testId}"]`)];
  const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('button')];
  const button = (label: string) => buttons().find((b) => clean(b) === label);
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, el, storage, navigate, forward, clean, text, all, buttons, button, settle };
}

describe('WorkoutPage', () => {
  describe('plan states from WorkoutPlanService', () => {
    it('first generated plan: today, the week, today’s exercises and plan facts', async () => {
      const { el, text, all, storage } = await render();

      expect(el.querySelector('h1')?.textContent).toBe('Workout');
      expect(text('today-title')).toBe('Upper Body B');
      expect(all('today-meta')[0].querySelectorAll('li')).toHaveLength(2);
      expect([...all('today-meta')[0].querySelectorAll('li')].map((li) => li.textContent?.trim())).toEqual(['7 exercises', 'About 50 min']);
      expect(all('week-day')).toHaveLength(7);
      expect(all('exercise')).toHaveLength(7);
      expect(all('prescription').map((p) => p.textContent?.replace(/\s+/g, ' ').trim())[0]).toBe('4 sets · 6–10 reps · 120 sec rest');
      expect(el.querySelector('dl')?.textContent).toContain('Build muscle');
      expect(all('plan-notice')).toHaveLength(0);
      expect(storage.values.has('fitness.workout-plan')).toBe(true);
    });

    it('existing stored plan renders as stored (no regeneration, no notice)', async () => {
      const stored = planFor();
      const { text, all, storage } = await render({ storedPlan: stored });
      expect(text('today-title')).toBe('Upper Body B');
      expect(all('plan-notice')).toHaveLength(0);
      expect(JSON.parse(storage.values.get('fitness.workout-plan')!).plan).toEqual(stored);
    });

    it('regenerated plan renders with a non-blocking update notice', async () => {
      const { text, all } = await render({ storedPlan: planFor(profileWith({ primaryGoal: 'get-stronger' })) });
      expect(all('plan-notice').map((n) => n.querySelector('h2')?.textContent)).toEqual(['Your plan was updated']);
      expect(text('today-title')).toBe('Upper Body B');
      expect(all('exercise')).toHaveLength(7);
    });

    it('a plan that could not be saved still renders, with a subtle warning', async () => {
      const { text, all, storage } = await render({ failWrites: true });
      expect(text('today-title')).toBe('Upper Body B');
      expect(all('plan-notice').map((n) => n.querySelector('h2')?.textContent)).toEqual(["Your plan isn't saved on this device"]);
      expect(storage.values.has('fitness.workout-plan')).toBe(false);
    });

    it('no profile: explains and links to onboarding', async () => {
      const { text, button, navigate, settle } = await render({ profile: null });
      expect(text('no-profile')).toContain('Complete your profile');
      expect(text('no-profile')).toContain('We need your fitness profile before we can create your training plan.');
      button('Set Up Profile')!.click();
      await settle();
      expect(navigate).toHaveBeenCalledWith(ONBOARDING_PATH);
    });

    it('unavailable: friendly message without raw errors; retry and review profile', async () => {
      const { el, text, button, navigate, settle } = await render({ brokenEngine: true });
      expect(text('unavailable')).toContain("We couldn't create your plan");
      expect(el.textContent).not.toMatch(/invalid-configuration|Unknown version/);

      const load = vi.spyOn(TestBed.inject(WorkoutPlanService), 'load');
      button('Try Again')!.click();
      await settle();
      expect(load).toHaveBeenCalledTimes(1);

      button('Review Profile')!.click();
      await settle();
      expect(navigate).toHaveBeenCalledWith(ONBOARDING_REVIEW_PATH);
    });

    it('a failing service is presented as unavailable, not as a crash', async () => {
      const storage = new MemoryKeyValueStorage();
      TestBed.configureTestingModule({
        providers: [provideIonicAngular(), provideRouter([]), { provide: KeyValueStorage, useValue: storage }],
      });
      vi.spyOn(TestBed.inject(WorkoutPlanService), 'load').mockRejectedValue(new Error('boom'));
      const fixture = TestBed.createComponent(WorkoutPage);
      await fixture.whenStable();
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="unavailable"]')).not.toBeNull();
    });

    it('loading: skeletons with a screen-reader status, not a spinner-only screen', async () => {
      TestBed.configureTestingModule({
        providers: [provideIonicAngular(), provideRouter([]), { provide: KeyValueStorage, useValue: new MemoryKeyValueStorage() }],
      });
      vi.spyOn(TestBed.inject(WorkoutPlanService), 'load').mockReturnValue(new Promise(() => undefined));
      const fixture = TestBed.createComponent(WorkoutPage);
      fixture.detectChanges();
      const loading = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="loading"]');
      expect(loading?.getAttribute('aria-busy')).toBe('true');
      expect(loading?.querySelector('[role="status"]')?.textContent).toBe('Loading your training plan');
      expect(loading?.querySelectorAll('fit-skeleton').length).toBeGreaterThan(1);
    });
  });

  describe('recent workouts', () => {
    const local = (day: number, hour: number) => new Date(2026, 9, day, hour, 0);
    const logs = [
      finishedLog({ startedAt: local(8, 7), minutes: 45 }),
      finishedLog({ startedAt: local(5, 7), minutes: 42, complete: (e) => e < 3, skipRest: true }),
      finishedLog({ startedAt: local(1, 7), minutes: 50 }),
      finishedLog({ startedAt: local(2, 7), minutes: 40 }),
    ];

    it('shows the latest three finished workouts compactly, newest first', async () => {
      const { all, clean } = await render({ history: logs });
      const items = all('recent-item');
      expect(items.map((i) => [clean(i.querySelector('.recent-title')), clean(i.querySelector('.recent-meta')), clean(i.querySelector('.recent-status'))])).toEqual([
        ['Upper Body A', 'Today · 45 min', 'Completed'],
        ['Upper Body A', 'Mon · 42 min', 'Finished · 10/22 sets'],
        ['Upper Body A', 'Fri · 40 min', 'Completed'], // within the last week: weekday
      ]);
    });

    it('opens a workout from history, or the full history', async () => {
      const { all, button, settle, forward } = await render({ history: logs });
      (all('recent-item')[1] as HTMLButtonElement).click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/workout', 'history', logs[1].id]);
      button('View History')!.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/workout', 'history']);
    });

    it('without history: a short note and a way to history; the plan stays primary', async () => {
      const { text, button, el } = await render();
      expect(text('recent')).toContain('Workouts you finish will appear here.');
      expect(button('View History')).toBeDefined();
      const order = [...el.querySelectorAll('h2')].map((h) => h.textContent?.trim());
      expect(order.indexOf('Recent workouts')).toBeGreaterThan(order.indexOf("Today's workout"));
    });
  });

  describe('interrupted workout', () => {
    it('offers to resume a workout in progress, first on the page', async () => {
      const { el, button, settle, forward } = await render({ activeSession: 'day-1-upper' });
      const card = el.querySelector('[data-testid="resume"]')!;
      expect([...card.querySelectorAll('h2, p, button')].map((n) => n.textContent?.trim())).toEqual([
        'Workout in progress',
        'Upper Body A',
        '0 of 22 sets done',
        'Resume Workout',
      ]);
      expect(el.querySelector('h2')?.textContent?.trim()).toBe('Workout in progress');
      button('Resume Workout')!.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/workout', 'session', 'day-1-upper', 'active']);
    });

    it('shows no resume card without a workout in progress', async () => {
      const { el } = await render();
      expect(el.querySelector('[data-testid="resume"]')).toBeNull();
    });
  });

  describe('session kinds', () => {
    it('resistance day: View Workout opens today’s session in Workout Detail (by session id)', async () => {
      const { button, forward, settle } = await render();
      expect(button('Start Workout')).toBeUndefined(); // starting happens from Workout Detail
      button('View Workout')!.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/workout', 'session', 'day-3-upper']);
    });

    it('activity day: activity hero with View Activity; never a workout', async () => {
      const { text, button, all, el, settle, forward } = await render({ profile: ACTIVITY_PROFILE });
      expect(text('today-title')).toBe('Light Activity');
      expect(el.querySelector('#workout-today-heading')?.textContent?.trim()).toBe("Today's activity");
      expect(text('today-meta')).toBe('Recovery · 20–30 min');
      expect(button('Start Workout')).toBeUndefined();
      expect(all('exercise')).toHaveLength(0);
      expect(el.querySelector('#workout-exercises')).toBeNull();

      button('View Activity')!.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/workout', 'session', 'day-4-light-activity']);
    });

    it('rest day: calm message, next session, no workout CTA; preview opens the next session', async () => {
      const { text, button, all, el, settle, forward } = await render({ profile: REST_PROFILE });
      expect(text('today-title')).toBe('Rest Day');
      expect(el.querySelector('app-today-hero')?.textContent).toContain('Recovery is part of your plan.');
      expect(text('up-next')).toBe('Next up: Full Body C on Friday.');
      expect(button('Start Workout')).toBeUndefined();
      expect(button('View Workout')).toBeUndefined();
      expect(all('exercise')).toHaveLength(0);
      button('Preview Full Body C')!.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/workout', 'session', 'day-3-full-body']);
    });

    it('bodyweight-only plan shows the substitution honestly', async () => {
      const { el } = await render({ profile: HOME_PROFILE, today: MONDAY });
      expect(el.textContent).toContain('Closest option for your equipment');
    });
  });

  describe('weekly schedule', () => {
    it('shows the generated week Monday first, today highlighted, with every day type distinguishable', async () => {
      const { all, clean } = await render();
      const rows = all('week-day');
      expect(rows.map((r) => clean(r.querySelector('.visually-hidden')))).toEqual([
        'Monday. Upper Body A. 7 exercises, about 50 minutes.',
        'Tuesday. Lower Body A. 7 exercises, about 45 minutes.',
        'Wednesday. Rest day.',
        'Thursday, today. Upper Body B. 7 exercises, about 50 minutes.',
        'Friday. Lower Body B. 7 exercises, about 40 minutes.',
        'Saturday. Rest day.',
        'Sunday. Rest day.',
      ]);
      const current = rows.map((r) => r.closest('li')!.getAttribute('aria-current'));
      expect(current).toEqual([null, null, null, 'date', null, null, null]);
      expect(rows[3].closest('li')?.textContent).toContain('Today');
    });

    it('training days open Workout Detail by session id; rest days are not interactive; no detail sheet', async () => {
      const { el, all, settle, forward } = await render();
      const rows = all('week-day');
      expect(rows.map((r) => r.tagName)).toEqual(['BUTTON', 'BUTTON', 'DIV', 'BUTTON', 'BUTTON', 'DIV', 'DIV']);

      (rows[1] as HTMLButtonElement).click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/workout', 'session', 'day-2-lower']);
      expect(el.querySelector('fit-bottom-sheet, ion-modal')).toBeNull();
    });
  });

  describe('accessibility', () => {
    it('has one h1, section h2s and exercise h3s in order', async () => {
      const { el } = await render();
      const headings = [...el.querySelectorAll('h1, h2, h3')].map((h) => `${h.tagName}:${h.textContent?.trim()}`);
      expect(headings.filter((h) => h.startsWith('H1'))).toEqual(['H1:Workout']);
      expect(headings.filter((h) => h.startsWith('H2'))).toEqual([
        "H2:Today's workout",
        'H2:This week',
        "H2:Today's exercises",
        'H2:Recent workouts',
        'H2:Your plan',
      ]);
      const levels = headings.map((h) => Number(h[1]));
      levels.forEach((level, i) => i > 0 && expect(level - levels[i - 1]).toBeLessThanOrEqual(1));
      expect(headings.filter((h) => h.startsWith('H3'))).toHaveLength(7);
    });

    it('every button has an accessible name and explicit type', async () => {
      for (const profile of [PROFILE, ACTIVITY_PROFILE, REST_PROFILE]) {
        TestBed.resetTestingModule();
        const { buttons, clean } = await render({ profile });
        for (const b of buttons()) {
          expect(clean(b) || b.getAttribute('aria-label'), b.outerHTML.slice(0, 80)).toBeTruthy();
          expect(b.getAttribute('type')).toBe('button');
        }
      }
    });

    it('sections are labelled by their headings', async () => {
      const { el } = await render();
      for (const section of el.querySelectorAll('section[aria-labelledby]')) {
        const id = section.getAttribute('aria-labelledby')!;
        expect(el.querySelector(`#${id}`), id).not.toBeNull();
      }
    });

    it('today’s hero is a labelled region with a named action', async () => {
      const { el } = await render();
      const hero = el.querySelector('app-today-hero section');
      expect(hero?.getAttribute('aria-labelledby')).toBe('workout-today-heading');
      expect(hero?.querySelector('button')?.textContent?.trim()).toBe('View Workout');
    });
  });
});
