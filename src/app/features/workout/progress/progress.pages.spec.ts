import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { KeyValueStorage } from '../../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../../core/time/clock';
import { WorkoutHistoryService } from '../../../core/workout/workout-history.service';
import { WorkoutLog } from '../../../domain/workout-session';
import { BODYWEIGHT_PROFILE, GYM_PROFILE, finishedLog, planFor } from '../../../domain/workout-session/testing/workout-log-fixtures';
import { YouPage } from '../../you/you.page';
import { ExercisePerformancePage } from './exercise-performance.page';
import { ProgressExercisesPage } from './progress-exercises.page';
import { ProgressPage } from './progress.page';

const local = (month: number, day: number, hour = 9) => new Date(2026, month - 1, day, hour, 0);
const NOW = local(10, 8, 20);

const bench = (startedAt: Date, weight: number, reps: number) =>
  finishedLog({ startedAt, minutes: 45, entry: (e, s) => (e === 0 ? { weight: s === 0 ? weight : weight - 2.5, reps } : { weight: 30, reps: 10 }) });
const LOGS = [bench(local(10, 8, 7), 62.5, 7), bench(local(10, 5, 7), 60, 8), bench(local(9, 30, 7), 57.5, 8)];

function configure(logs: readonly WorkoutLog[]) {
  const storage = new MemoryKeyValueStorage();
  storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile: GYM_PROFILE }));
  if (logs.length) {
    storage.values.set('fitness.workout-logs', JSON.stringify({ version: 1, logs }));
  }
  TestBed.configureTestingModule({
    providers: [provideIonicAngular(), provideRouter([]), { provide: KeyValueStorage, useValue: storage }, { provide: CLOCK, useValue: () => NOW }],
  });
  const nav = TestBed.inject(NavController);
  return {
    forward: vi.spyOn(nav, 'navigateForward').mockResolvedValue(true),
    back: vi.spyOn(nav, 'navigateBack').mockResolvedValue(true),
    root: vi.spyOn(nav, 'navigateRoot').mockResolvedValue(true),
  };
}

async function render<T>(component: Type<T>, logs: readonly WorkoutLog[], inputs: Record<string, unknown> = {}, before?: () => void) {
  const spies = configure(logs);
  before?.();
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const button = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => clean(b) === label);
  return { ...spies, fixture, el, settle, button };
}

const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('Progress', () => {
  describe('You entry', () => {
    it('opens Progress from You (no new tab)', async () => {
      const { el, forward, settle } = await render(YouPage, []);
      const entry = el.querySelector<HTMLButtonElement>('[data-testid="progress-entry"]')!;
      expect(clean(entry)).toBe('Progress Training activity and performance');
      entry.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/you', 'progress']);
    });
  });

  describe('progress page', () => {
    it('shows overview, this week, activity and recent performance', async () => {
      const { el } = await render(ProgressPage, LOGS);
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Progress');
      expect([...el.querySelectorAll('[data-testid="overview"] .tile')].map((t) => [clean(t.querySelector('dt')), clean(t.querySelector('dd'))])).toEqual([
        ['This week', '2 workouts'],
        ['This month', '2 workouts'],
        ['Total', '3 workouts'],
      ]); // count and unit read together
      expect(clean(el.querySelector('[data-testid="week-summary"]'))).toBe('2 workouts');
      expect([...el.querySelectorAll('[data-testid="activity"] .fact')].map((f) => [clean(f.querySelector('dt')), clean(f.querySelector('dd'))])).toEqual([
        ['Sets completed', '66'],
        ['Training time', '2 h 15 min'],
        ['Last workout', 'Today'],
      ]);
      const first = el.querySelector('[data-testid="performance-item"]')!;
      expect(clean(first)).toBe('Bench Press Latest 62.5 kg × 7 Last performed · Today');
    });

    it('the week row states each day in text, not only by the check mark', async () => {
      const { el } = await render(ProgressPage, LOGS);
      const days = [...el.querySelectorAll('[data-testid="week-days"] li')];
      expect(days.map((d) => clean(d.querySelector('.visually-hidden')))).toEqual([
        'Monday: workout completed',
        'Tuesday: no workout',
        'Wednesday: no workout',
        'Thursday: workout completed',
        'Friday: upcoming',
        'Saturday: upcoming',
        'Sunday: upcoming',
      ]);
      expect(days.map((d) => d.getAttribute('aria-current'))).toEqual([null, null, null, 'date', null, null, null]);
      expect(el.textContent).not.toMatch(/streak/i);
    });

    it('opens an exercise and the full exercise list', async () => {
      const { el, forward, settle, button } = await render(ProgressPage, LOGS);
      (el.querySelector('[data-testid="performance-item"]') as HTMLButtonElement).click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/you', 'progress', 'exercise', 'barbell-bench-press']);
      button('View all exercises')!.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/you', 'progress', 'exercises']);
    });

    it('partial workouts count when something was completed', async () => {
      const partial = finishedLog({ startedAt: local(10, 8, 7), minutes: 25, complete: (e, s) => e === 0 && s < 2, skipRest: true });
      const { el } = await render(ProgressPage, [partial]);
      expect(clean(el.querySelector('[data-testid="overview"] dd'))).toBe('1 workout');
      expect(el.querySelectorAll('[data-testid="performance-item"]')).toHaveLength(1);
    });

    it('empty: invites the first workout, without fake numbers', async () => {
      const { el, root, button, settle } = await render(ProgressPage, []);
      expect(clean(el.querySelector('[data-testid="progress-empty"]'))).toContain('Your progress starts here');
      expect(el.querySelector('[data-testid="overview"]')).toBeNull();
      button('View Workout')!.click();
      await settle();
      expect(root).toHaveBeenCalledWith('/workout');
    });

    it('error: friendly message and retry, no storage details', async () => {
      let fail = true;
      const { el, button, settle } = await render(ProgressPage, LOGS, {}, () => {
        const service = TestBed.inject(WorkoutHistoryService);
        const progress = service.progress.bind(service);
        vi.spyOn(service, 'progress').mockImplementation(() => (fail ? Promise.resolve({ ok: false as const }) : progress()));
      });
      expect(clean(el.querySelector('[data-testid="progress-error"]'))).toContain("Couldn't load your progress");
      expect(clean(el.querySelector('[data-testid="announcement"]'))).toBe("Couldn't load your progress");
      fail = false;
      button('Try Again')!.click();
      await settle();
      expect(el.querySelector('[data-testid="overview"]')).not.toBeNull();
    });

    it('loading: skeletons and an announcement', () => {
      configure(LOGS);
      vi.spyOn(TestBed.inject(WorkoutHistoryService), 'progress').mockReturnValue(new Promise(() => undefined));
      const fixture = TestBed.createComponent(ProgressPage);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="progress-loading"]')?.getAttribute('aria-busy')).toBe('true');
      expect(clean(el.querySelector('[data-testid="announcement"]'))).toBe('Loading your progress');
    });

    it('headings: h1 then section h2s; every button is named', async () => {
      const { el } = await render(ProgressPage, LOGS);
      expect([...el.querySelectorAll('h1, h2')].map((h) => `${h.tagName}:${clean(h)}`)).toEqual([
        'H1:Progress',
        'H2:Overview',
        'H2:Training this week',
        'H2:Training activity',
        'H2:Recent performance',
      ]);
      for (const b of el.querySelectorAll('button')) {
        expect(clean(b)).not.toBe('');
        expect(b.getAttribute('type')).toBe('button');
      }
    });
  });

  describe('exercise performance page', () => {
    it('shows latest, recent best and recent sessions of actual sets', async () => {
      const { el } = await render(ExercisePerformancePage, LOGS, { exerciseId: 'barbell-bench-press' });
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Bench Press');
      expect(clean(el.querySelector('.intro .note'))).toBe('Completed sets from your workouts. Planned targets are not shown here.');
      expect(clean(el.querySelector('[data-testid="latest"]'))).toBe('62.5 kg × 7');
      expect(clean(el.querySelector('[data-testid="recent-best"]'))).toBe('62.5 kg × 7');
      const sessions = [...el.querySelectorAll('[data-testid="performance-session"]')];
      expect(sessions.map((s) => clean(s.querySelector('h3')))).toEqual(['Today', 'Monday, Oct 5', 'Wednesday, Sep 30']);
      expect([...sessions[1].querySelectorAll('li')].map((li) => clean(li))).toEqual([
        'Set 1 60 kg × 8',
        'Set 2 57.5 kg × 8',
        'Set 3 57.5 kg × 8',
        'Set 4 57.5 kg × 8',
      ]);
      expect(sessions[1].querySelector('ol')?.getAttribute('aria-label')).toBe('Monday, Oct 5, completed sets');
    });

    it('bodyweight and timed exercises show reps and seconds, never invented weight', async () => {
      const plan = planFor(BODYWEIGHT_PROFILE);
      const log = finishedLog({ plan, sessionId: plan.sessions[0].id, startedAt: local(10, 7), minutes: 35 });
      const pushUps = await render(ExercisePerformancePage, [log], { exerciseId: 'push-up' });
      expect(clean(pushUps.el.querySelector('[data-testid="latest"]'))).toBe('10 reps');
      expect(pushUps.el.textContent).not.toMatch(/\bkg\b/);

      TestBed.resetTestingModule();
      const timedId = log.exercises.find((e) => e.logging === 'duration')!.exerciseId;
      const timed = await render(ExercisePerformancePage, [log], { exerciseId: timedId });
      expect([...timed.el.querySelectorAll('[data-testid="performance-session"] li')].map((li) => clean(li))).toEqual([
        'Set 1 30 sec',
        'Set 2 35 sec',
        'Set 3 40 sec',
      ]);
    });

    it('an exercise with no completed sets: calm not-found with a way back', async () => {
      const { el, back, button, settle } = await render(ExercisePerformancePage, LOGS, { exerciseId: 'nordic-curl' });
      expect(clean(el.querySelector('[data-testid="performance-not-found"]'))).toContain('No performance yet');
      button('Back to Progress')!.click();
      await settle();
      expect(back).toHaveBeenCalledWith('/you/progress');
    });

    it('a storage failure is an error, not "not found"', async () => {
      const { el } = await render(ExercisePerformancePage, LOGS, { exerciseId: 'barbell-bench-press' }, () =>
        vi.spyOn(TestBed.inject(WorkoutHistoryService), 'progress').mockResolvedValue({ ok: false }),
      );
      expect(clean(el.querySelector('[data-testid="performance-error"]'))).toContain("Couldn't load your progress");
    });
  });

  describe('all exercises page', () => {
    it('lists every performed exercise, most recent first', async () => {
      const { el, forward, settle } = await render(ProgressExercisesPage, LOGS);
      const items = [...el.querySelectorAll('[data-testid="performance-item"]')];
      expect(items).toHaveLength(7);
      expect(clean(items[0].querySelector('.name'))).toBe('Bench Press');
      (items[2] as HTMLButtonElement).click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/you', 'progress', 'exercise', expect.any(String)]);
    });
  });
});
