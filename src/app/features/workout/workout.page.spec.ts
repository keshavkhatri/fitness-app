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
  const button = (label: string) => buttons().find((b) => clean(b) === label || b.getAttribute('aria-label') === label);
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, el, storage, navigate, forward, clean, text, all, buttons, button, settle };
}

describe('WorkoutPage', () => {
  describe('plan states from WorkoutPlanService', () => {
    it('first generated plan: the switch, the week, today’s workout, the week’s sessions and plan facts', async () => {
      const { el, text, all, storage, clean } = await render();

      expect(el.querySelector('h1')?.textContent).toBe('Workout');
      expect(el.querySelector('[data-testid="switch-plan"]')?.getAttribute('aria-current')).toBe('page');
      expect(all('strip-day')).toHaveLength(7);
      expect(clean(el.querySelector('#workout-today'))).toBe('Today•Thursday, 8 Oct');
      expect(clean(el.querySelector('[data-testid="plan-today"] h2'))).toBe('Upper Body B');
      expect([...el.querySelectorAll('[data-testid="plan-today"] .meta li')].map((li) => clean(li))).toEqual(['About 50 min', '7 exercises']);
      expect([...el.querySelectorAll('[data-testid="plan-today-areas"] li')].map((li) => clean(li))).toEqual(['Chest', 'Back', 'Shoulders']);
      expect(all('plan-week-row')).toHaveLength(4);
      expect(text('plan-week-progress')).toBe('0 of 4 done');
      expect(el.querySelector('dl')?.textContent).toContain('Build muscle');
      expect(all('plan-notice')).toHaveLength(0);
      expect(storage.values.has('fitness.workout-plan')).toBe(true);
    });

    it('existing stored plan renders as stored (no regeneration, no notice)', async () => {
      const stored = planFor();
      const { el, all, storage, clean } = await render({ storedPlan: stored });
      expect(clean(el.querySelector('[data-testid="plan-today"] h2'))).toBe('Upper Body B');
      expect(all('plan-notice')).toHaveLength(0);
      expect(JSON.parse(storage.values.get('fitness.workout-plan')!).plan).toEqual(stored);
    });

    it('regenerated plan renders with a non-blocking update notice', async () => {
      const { all } = await render({ storedPlan: planFor(profileWith({ primaryGoal: 'get-stronger' })) });
      expect(all('plan-notice').map((n) => n.querySelector('h2')?.textContent)).toEqual(['Your plan was updated']);
      expect(all('plan-week-row')).toHaveLength(4);
    });

    it('a plan that could not be saved still renders, with a subtle warning', async () => {
      const { all, storage } = await render({ failWrites: true });
      expect(all('plan-today')).toHaveLength(1);
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

  describe('Plan / History switch', () => {
    it('History opens the history route (a link, not a second state of this page)', async () => {
      const { el, settle, forward } = await render();
      const history = el.querySelector<HTMLAnchorElement>('[data-testid="switch-history"]')!;
      expect(history.getAttribute('href')).toBe('/workout/history');
      expect(history.closest('nav')?.getAttribute('aria-label')).toBe('Workout views');
      history.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/workout', 'history']);
    });
  });

  describe('today’s workout', () => {
    it('Start workout starts today’s session and opens the Active Workout (the plan is unchanged)', async () => {
      const { button, settle, forward, storage } = await render();
      const plan = storage.values.get('fitness.workout-plan');
      button('Start workout')!.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/workout', 'session', 'day-3-upper', 'active']);
      expect(JSON.parse(storage.values.get('fitness.workout-active')!).log.source.sessionId).toBe('day-3-upper');
      expect(storage.values.get('fitness.workout-plan')).toBe(plan);
    });

    it('another workout in progress: the card resumes it (one workout at a time)', async () => {
      const { el, button, settle, forward, clean } = await render({ activeSession: 'day-1-upper' });
      expect(el.querySelector('[data-testid="plan-today"]')?.getAttribute('data-kind')).toBe('resume');
      expect(clean(el.querySelector('[data-testid="plan-today"] h2'))).toBe('Upper Body A');
      expect(clean(el.querySelector('[data-testid="plan-today-progress"]'))).toBe('0 of 22 sets done');
      expect(button('Start workout')).toBeUndefined();
      button('Resume workout')!.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/workout', 'session', 'day-1-upper', 'active']);
    });

    it('done today: the card shows the record instead of a second start', async () => {
      const done = finishedLog({ plan: planFor(), sessionId: 'day-3-upper', startedAt: new Date(2026, 9, 8, 7, 0), minutes: 50 });
      const { el, button, settle, forward, all } = await render({ history: [done] });
      expect(el.querySelector('[data-testid="plan-today"]')?.getAttribute('data-kind')).toBe('done');
      expect(button('Start workout')).toBeUndefined();
      button('View workout')!.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/workout', 'history', done.id]);
      expect(all('plan-week-row')[2].getAttribute('data-status')).toBe('done');
    });

    it('activity day: the activity, with a way to its detail; never a workout start', async () => {
      const { el, button, settle, forward, clean } = await render({ profile: ACTIVITY_PROFILE });
      expect(clean(el.querySelector('[data-testid="plan-today"] h2'))).toBe('Light Activity');
      expect(button('Start workout')).toBeUndefined();
      button('View activity')!.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/workout', 'session', 'day-4-light-activity']);
    });

    it('rest day: says so with what comes next; the action moves to the week', async () => {
      const { el, text, button, clean } = await render({ profile: REST_PROFILE });
      expect(clean(el.querySelector('[data-testid="plan-today"] h2'))).toBe('Rest Day');
      expect(text('plan-today-next')).toBe('Next up: Full Body C on Friday.');
      expect(button('Start workout')).toBeUndefined();
      button('View this week')!.click();
      expect(document.activeElement?.id).toBe('workout-week');
    });
  });

  describe('the week', () => {
    it('the strip shows Monday–Sunday with dates; today is current; training days are buttons, rest days are not', async () => {
      const { all, settle, forward, clean } = await render();
      const days = all('strip-day');
      expect(days.map((d) => clean(d.querySelector('.date')))).toEqual(['5', '6', '7', '8', '9', '10', '11']);
      expect(days.map((d) => d.getAttribute('aria-current'))).toEqual([null, null, null, 'date', null, null, null]);
      expect(days.map((d) => d.tagName)).toEqual(['BUTTON', 'BUTTON', 'SPAN', 'BUTTON', 'BUTTON', 'SPAN', 'SPAN']);
      expect(days[3].getAttribute('aria-label')).toBe('Thursday 8 October, today. Upper Body B.');
      expect(days[2].getAttribute('aria-label')).toBe('Wednesday 7 October. Rest day.');
      (days[1] as HTMLButtonElement).click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/workout', 'session', 'day-2-lower']);
    });

    it('rows: each training session with its length, date and status; a row opens its detail', async () => {
      const monday = finishedLog({ plan: planFor(), sessionId: 'day-1-upper', startedAt: new Date(2026, 9, 5, 18, 0), minutes: 50 });
      const { all, settle, forward, text } = await render({ history: [monday] });
      const rows = all('plan-week-row');
      expect(rows.map((r) => [r.getAttribute('data-status'), r.getAttribute('aria-label')])).toEqual([
        ['done', 'Upper Body A, Mon, 5 Oct. About 50 minutes, 7 exercises. Done.'],
        ['missed', 'Lower Body A, Tue, 6 Oct. About 45 minutes, 7 exercises. Not done.'],
        ['upcoming', 'Upper Body B, Today. About 50 minutes, 7 exercises. Planned.'],
        ['upcoming', 'Lower Body B, Fri, 9 Oct. About 40 minutes, 7 exercises. Planned.'],
      ]);
      expect(text('plan-week-progress')).toBe('1 of 4 done');
      expect(all('strip-day')[0].getAttribute('data-state')).toBe('done');
      (rows[3] as HTMLButtonElement).click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/workout', 'session', 'day-4-lower']);
    });
  });

  describe('accessibility', () => {
    it('has one h1 and section h2s in order', async () => {
      const { el } = await render();
      const headings = [...el.querySelectorAll('h1, h2, h3')].map((h) => `${h.tagName}:${h.textContent?.replace(/\s+/g, ' ').trim()}`);
      expect(headings).toEqual(['H1:Workout', 'H2:Today•Thursday, 8 Oct', 'H2:Upper Body B', 'H2:This week', 'H2:Your plan']);
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
  });
});
