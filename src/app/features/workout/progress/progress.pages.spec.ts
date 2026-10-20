import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { KeyValueStorage } from '../../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../../core/time/clock';
import { WorkoutHistoryService } from '../../../core/workout/workout-history.service';
import { BodyCompositionAssessment, MANUAL_INBODY_SOURCE, createBodyCompositionAssessment } from '../../../domain/body-composition';
import { WeightEntry, createWeightEntry } from '../../../domain/body-measurements';
import { WorkoutLog } from '../../../domain/workout-session';
import { BODYWEIGHT_PROFILE, GYM_PROFILE, finishedLog, planFor } from '../../../domain/workout-session/testing/workout-log-fixtures';
import { ExercisePerformancePage } from './exercise-performance.page';
import { ProgressExercisesPage } from './progress-exercises.page';
import { ProgressPage } from './progress.page';

const local = (month: number, day: number, hour = 9) => new Date(2026, month - 1, day, hour, 0);
const NOW = local(10, 8, 20);

const bench = (startedAt: Date, weight: number, reps: number) =>
  finishedLog({ startedAt, minutes: 45, entry: (e, s) => (e === 0 ? { weight: s === 0 ? weight : weight - 2.5, reps } : { weight: 30, reps: 10 }) });
const LOGS = [bench(local(10, 8, 7), 62.5, 7), bench(local(10, 5, 7), 60, 8), bench(local(9, 30, 7), 57.5, 8)];

interface Body {
  readonly weights?: readonly WeightEntry[];
  readonly assessments?: readonly BodyCompositionAssessment[];
}

function configure(logs: readonly WorkoutLog[], body: Body = {}) {
  const storage = new MemoryKeyValueStorage();
  storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile: GYM_PROFILE }));
  if (body.weights) {
    storage.values.set('fitness.body-weight-entries', JSON.stringify({ version: 1, entries: body.weights }));
  }
  if (body.assessments) {
    storage.values.set('fitness.body-composition-assessments', JSON.stringify({ version: 1, assessments: body.assessments }));
  }
  if (logs.length) {
    storage.values.set('fitness.workout-logs', JSON.stringify({ version: 1, logs }));
  }
  TestBed.configureTestingModule({
    providers: [provideIonicAngular(), provideRouter([]), { provide: KeyValueStorage, useValue: storage }, { provide: CLOCK, useValue: () => NOW }],
  });
  const nav = TestBed.inject(NavController);
  return {
    storage,
    forward: vi.spyOn(nav, 'navigateForward').mockResolvedValue(true),
    back: vi.spyOn(nav, 'navigateBack').mockResolvedValue(true),
    root: vi.spyOn(nav, 'navigateRoot').mockResolvedValue(true),
  };
}

async function render<T>(component: Type<T>, logs: readonly WorkoutLog[], inputs: Record<string, unknown> = {}, before?: () => void, body: Body = {}) {
  const spies = configure(logs, body);
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
  // Weights and body composition load on their own; let them settle too.
  await settle();
  const button = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => clean(b) === label || b.getAttribute('aria-label') === label);
  return { ...spies, fixture, el, settle, button };
}

const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const weigh = (id: string, date: string, kg: number): WeightEntry => {
  const r = createWeightEntry({ weight: kg, unitSystem: 'metric', date }, { id, now: `${date}T07:00:00.000Z`, today: '2026-10-08' });
  if (!r.ok) {
    throw new Error('bad weight');
  }
  return r.value;
};
const assess = (id: string, date: string, fat: number): BodyCompositionAssessment => {
  const r = createBodyCompositionAssessment(
    { date, source: MANUAL_INBODY_SOURCE, values: { 'body-fat-percentage': { value: fat, unit: '%' } } },
    { id, now: `${date}T08:00:00.000Z`, today: '2026-10-08' },
  );
  if (!r.ok) {
    throw new Error('bad assessment');
  }
  return r.value;
};

describe('Progress', () => {
  describe('progress overview', () => {
    const BODY = { weights: [weigh('w1', '2026-06-01', 80), weigh('w2', '2026-10-01', 79), weigh('w3', '2026-10-07', 78.4)], assessments: [assess('a1', '2026-09-01', 21.7), assess('a2', '2026-10-01', 18.5)] };

    it('shows body recordings, the weight trend, consistency, key metrics and recent exercises', async () => {
      const { el } = await render(ProgressPage, LOGS, {}, undefined, BODY);
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Progress');
      const cards = [...el.querySelectorAll('[data-testid="body-metrics"] .body-card')];
      expect(cards.map((c) => clean(c.querySelector('.body-value')))).toEqual(['78.4 kg', '18.5 %', '–']);
      expect(cards.map((c) => clean(c.querySelector('.body-caption')))).toEqual(['vs 1 Oct', 'vs 1 Sep', 'Not recorded']);
      expect(clean(el.querySelector('[data-testid="weight-chart-callout"] .callout-value'))).toBe('78.4 kg');
      expect(clean(el.querySelector('[data-testid="weight-chart-callout"] .callout-date'))).toBe('7 Oct');
      expect(el.querySelectorAll('[data-testid="weight-chart-point"]')).toHaveLength(2); // last 90 days: Oct 1 and Oct 7
      expect(clean(el.querySelector('[data-testid="consistency-summary"]'))).toBe('2 of 2 weeks with a workout');
      expect([...el.querySelectorAll('[data-testid="key-metrics"] .metric')].map((m) => clean(m.querySelector('dt')))).toEqual([
        'Total workouts',
        'Total volume',
        'Avg. duration',
      ]);
      expect(clean(el.querySelector('[data-testid="key-metrics"] [data-key="workouts"] .metric-value'))).toBe('3');
      expect(el.querySelectorAll('[data-testid="exercise-row"]').length).toBe(4);
    });

    it('the weight range changes the chart (domain ranges only)', async () => {
      const { el, fixture } = await render(ProgressPage, LOGS, {}, undefined, BODY);
      const all = [...el.querySelectorAll<HTMLInputElement>('input[name="progress-weight-range"]')];
      expect(all.map((i) => i.value)).toEqual(['30d', '90d', '180d', '365d', 'all']);
      all[4].click();
      fixture.detectChanges();
      expect(el.querySelectorAll('[data-testid="weight-chart-point"]')).toHaveLength(3);
      all[0].click();
      fixture.detectChanges();
      expect(el.querySelectorAll('[data-testid="weight-chart-point"]')).toHaveLength(2);
    });

    it('no recordings: says so (never a zero) and offers to add a weight', async () => {
      const { el, button, settle, forward } = await render(ProgressPage, LOGS);
      expect([...el.querySelectorAll('.body-caption')].map((c) => clean(c))).toEqual(['Not recorded', 'Not recorded', 'Not recorded']);
      expect(el.querySelector('[data-testid="weight-none"]')).not.toBeNull();
      button('Add weight')!.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/you', 'weight-history', 'new']);
    });

    it('the Overview / Workout / Body switch shows one half of the page', async () => {
      const { el, fixture } = await render(ProgressPage, LOGS, {}, undefined, BODY);
      const pick = (value: string) => {
        el.querySelector<HTMLInputElement>(`input[name="progress-view"][value="${value}"]`)!.click();
        fixture.detectChanges();
      };
      pick('workout');
      expect(el.querySelector('[data-testid="body-metrics"]')).toBeNull();
      expect(el.querySelector('[data-testid="consistency"]')).not.toBeNull();
      pick('body');
      expect(el.querySelector('[data-testid="consistency"]')).toBeNull();
      expect(el.querySelector('[data-testid="weight-trend"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="body-composition-link"]')).not.toBeNull();
    });

    it('opens an exercise, all exercises, and the weight history (within this Progress stack)', async () => {
      const { el, button, settle, forward } = await render(ProgressPage, LOGS, {}, undefined, BODY);
      el.querySelector<HTMLButtonElement>('[data-testid="exercise-row"]')!.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/you/progress', 'exercise', LOGS[0].exercises[0].exerciseId]);
      button('See all')!.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/you/progress', 'exercises']);
      el.querySelector<HTMLButtonElement>('[data-key="weight"] button')!.click();
      await settle();
      expect(forward).toHaveBeenCalledWith('/you/weight-history');
    });

    it('no workouts: invites the first one without fake numbers; body still shows', async () => {
      const { el, button, settle, root } = await render(ProgressPage, [], {}, undefined, BODY);
      expect(clean(el.querySelector('[data-testid="progress-empty"]'))).toContain('Your training progress starts here');
      expect(el.querySelector('[data-testid="key-metrics"]')).toBeNull();
      expect(clean(el.querySelector('[data-testid="weight-chart-callout"] .callout-value'))).toBe('78.4 kg');
      button('View workout')!.click();
      await settle();
      expect(root).toHaveBeenCalledWith('/workout');
    });

    it('a history failure: friendly error and retry, the body half unaffected', async () => {
      const { el } = await render(ProgressPage, LOGS, {}, () => vi.spyOn(TestBed.inject(WorkoutHistoryService), 'list').mockResolvedValue({ ok: false }), BODY);
      expect(clean(el.querySelector('[data-testid="progress-error"]'))).toContain("Couldn't load your workouts");
      expect(el.textContent).not.toMatch(/storage|exception/i);
      expect(el.querySelector('[data-testid="weight-trend"]')).not.toBeNull();
    });

    it('headings: one h1, then section h2s; every button is named', async () => {
      const { el } = await render(ProgressPage, LOGS, {}, undefined, BODY);
      const headings = [...el.querySelectorAll('h1, h2')].map((h) => h.tagName);
      expect(headings[0]).toBe('H1');
      expect(headings.filter((h) => h === 'H1')).toHaveLength(1);
      for (const b of el.querySelectorAll('button')) {
        expect(clean(b) || b.getAttribute('aria-label')).not.toBe('');
        expect(b.getAttribute('type')).toBe('button');
      }
    });
  });

  describe('exercise list', () => {
    it('lists every performed exercise; search and area filter work together; clear resets', async () => {
      const { el, fixture, button } = await render(ProgressExercisesPage, LOGS);
      const names = () => [...el.querySelectorAll('[data-testid="exercise-row"] .name')].map((n) => clean(n));
      const total = names().length;
      expect(total).toBeGreaterThan(4);

      const search = el.querySelector<HTMLInputElement>('[data-testid="exercise-search"]')!;
      search.value = 'press';
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(names().every((n) => /press/i.test(n))).toBe(true);

      [...el.querySelectorAll<HTMLButtonElement>('[data-testid="area-filters"] button')].find((b) => clean(b) === 'Chest')!.click();
      fixture.detectChanges();
      expect(names()).toEqual(['Bench Press']);

      search.value = 'squat';
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="exercises-no-match"]')).not.toBeNull();
      button('Clear filters')!.click();
      fixture.detectChanges();
      expect(names()).toHaveLength(total);
    });

    it('sorts by name, and opens the selected exercise by its id', async () => {
      const { el, fixture, forward, settle } = await render(ProgressExercisesPage, LOGS);
      const select = el.querySelector<HTMLSelectElement>('[data-testid="exercise-sort"]')!;
      select.value = 'name';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      const names = [...el.querySelectorAll('[data-testid="exercise-row"] .name')].map((n) => clean(n));
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
      const row = [...el.querySelectorAll<HTMLButtonElement>('[data-testid="exercise-row"]')].find((r) => clean(r.querySelector('.name')) === 'Bench Press')!;
      row.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/you/progress', 'exercise', 'barbell-bench-press']);
    });

    it('without history: says so; a failure is an error with retry', async () => {
      const empty = await render(ProgressExercisesPage, []);
      expect(empty.el.querySelector('[data-testid="exercises-empty"]')).not.toBeNull();
      TestBed.resetTestingModule();
      const failed = await render(ProgressExercisesPage, LOGS, {}, () => vi.spyOn(TestBed.inject(WorkoutHistoryService), 'list').mockResolvedValue({ ok: false }));
      expect(failed.el.querySelector('[data-testid="exercises-error"]')).not.toBeNull();
    });
  });

  describe('exercise performance', () => {
    const HISTORY = [bench(local(10, 8, 7), 100, 6), bench(local(10, 1, 7), 95, 6), bench(local(9, 24, 7), 92.5, 6), bench(local(7, 10, 7), 90, 8)];

    it('shows the best set, the change, a chart of recorded values and the sessions', async () => {
      const { el } = await render(ExercisePerformancePage, HISTORY, { exerciseId: 'barbell-bench-press' });
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Bench Press');
      expect(clean(el.querySelector('[data-testid="performance-best"]'))).toContain('100 kg × 6');
      expect(clean(el.querySelector('[data-testid="performance-change"]'))).toBe('Max weight +10 kg since 10 Jul');
      expect(el.querySelectorAll('[data-testid="performance-point"]')).toHaveLength(4);
      expect(el.querySelector('[data-testid="performance-chart"]')?.getAttribute('aria-label')).toContain('4 sessions');
      expect(el.querySelectorAll('[data-testid="performance-session"]')).toHaveLength(4);
      expect(el.textContent).not.toMatch(/1RM|estimated/i);
    });

    it('the range and metric change the chart; a session opens its workout record (the one history detail)', async () => {
      const { el, fixture, forward, settle } = await render(ExercisePerformancePage, HISTORY, { exerciseId: 'barbell-bench-press' });
      const ranges = [...el.querySelectorAll<HTMLInputElement>('input[name="performance-range"]')].map((i) => i.value);
      expect(ranges).toEqual(['1m', '3m', '6m', '1y', 'all']);
      el.querySelector<HTMLInputElement>('input[name="performance-range"][value="1m"]')!.click();
      fixture.detectChanges();
      expect(el.querySelectorAll('[data-testid="performance-point"]')).toHaveLength(3);
      expect(el.querySelectorAll('[data-testid="performance-session"]')).toHaveLength(3);
      el.querySelector<HTMLInputElement>('input[name="performance-metric"][value="reps"]')!.click();
      fixture.detectChanges();
      expect(clean(el.querySelector('[data-testid="performance-latest"] .callout-value'))).toBe('6 reps');

      el.querySelector<HTMLButtonElement>('[data-testid="performance-session"]')!.click();
      await settle();
      expect(forward).toHaveBeenCalledWith(['/you/progress', 'workout', HISTORY[0].id]);
    });

    it('viewing never changes the stored history', async () => {
      const { storage } = await render(ExercisePerformancePage, HISTORY, { exerciseId: 'barbell-bench-press' });
      expect(JSON.parse(storage.values.get('fitness.workout-logs')!).logs).toEqual(HISTORY);
    });

    it('bodyweight work shows reps, never an invented weight', async () => {
      const plan = planFor(BODYWEIGHT_PROFILE);
      const log = finishedLog({ plan, sessionId: plan.sessions[0].id, startedAt: local(10, 6), minutes: 30 });
      const { el } = await render(ExercisePerformancePage, [log], { exerciseId: 'push-up' });
      expect(clean(el.querySelector('[data-testid="performance-best"]'))).toContain('10 reps');
      expect(el.querySelector('input[name="performance-metric"]')).toBeNull();
      expect(el.textContent).not.toMatch(/\bkg\b/);
    });

    it('unknown exercise: not found with a way back; a storage failure is an error, not "not found"', async () => {
      const missing = await render(ExercisePerformancePage, HISTORY, { exerciseId: 'nope' });
      expect(missing.el.querySelector('[data-testid="performance-not-found"]')).not.toBeNull();
      TestBed.resetTestingModule();
      const failed = await render(ExercisePerformancePage, HISTORY, { exerciseId: 'barbell-bench-press' }, () =>
        vi.spyOn(TestBed.inject(WorkoutHistoryService), 'list').mockResolvedValue({ ok: false }),
      );
      expect(failed.el.querySelector('[data-testid="performance-error"]')).not.toBeNull();
    });
  });
});
