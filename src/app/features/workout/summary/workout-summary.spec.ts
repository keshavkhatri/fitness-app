import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { KeyValueStorage } from '../../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../../core/time/clock';
import { WorkoutLogService } from '../../../core/workout/workout-log.service';
import { WorkoutLog, completeSet, finishWorkout, skipExercise, startWorkoutLog } from '../../../domain/workout-session';
import { PROFILE, THURSDAY, planFor } from '../testing/workout-fixtures';
import { comparableWorkouts, formatDuration, toWorkoutSummaryScreen } from './workout-summary-view-model';
import { WorkoutSummaryPage } from './workout-summary.page';

const START = '2026-10-08T09:00:00.000Z';
const plan = planFor();
const UPPER = 'day-1-upper';
const OTHER = plan.sessions.find((s) => s.kind === 'resistance' && s.id !== UPPER && s.sessionType !== 'upper')!.id;

const must = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};

/** A finished workout: every set done at `weight` × 10 reps (or only the sets `keep` allows). */
function workout(
  id: string,
  options: { session?: string; start?: string; minutes?: number; weight?: number; unit?: 'kg' | 'lb'; keep?: (exercise: number, set: number) => boolean } = {},
): WorkoutLog {
  const start = options.start ?? START;
  const at = (m: number) => new Date(Date.parse(start) + m * 60_000).toISOString();
  let log = must(startWorkoutLog(plan, options.session ?? UPPER, { id, startedAt: start, weightUnit: options.unit ?? 'kg' }));
  log.exercises.forEach((e, ei) =>
    e.sets.forEach((_, si) => {
      if (options.keep?.(ei, si) ?? true) {
        log = must(completeSet(log, { exercise: ei, set: si }, { weight: options.weight ?? 20, reps: 10, durationSeconds: 30 }, at(1)));
      }
    }),
  );
  return must(finishWorkout(log, at(options.minutes ?? 42)));
}
const daysBefore = (days: number) => new Date(Date.parse(START) - days * 86_400_000).toISOString();

describe('workout summary', () => {
  describe('overview', () => {
    it('a fully completed workout: the real counts, volume and completion, and no calories', () => {
      const { overview } = toWorkoutSummaryScreen(workout('w'), []);
      expect(overview).toMatchObject({
        fullyCompleted: true,
        heading: 'Workout complete!',
        message: "Great job! You've finished your Upper Body A workout.",
        workoutName: 'Upper Body A',
        highlight: { tone: 'success', title: 'Every set completed' },
      });
      expect(Object.fromEntries(overview.stats.map((s) => [s.key, `${s.value}${s.unit ? ` ${s.unit}` : ''}`]))).toEqual({
        duration: '42 min',
        exercises: '7 of 7',
        sets: '22 of 22',
        volume: '3,800 kg', // the 19 weighted sets × 20 kg × 10 reps (the 3 bodyweight sets have no load)
        completion: '100%',
      });
      expect(JSON.stringify(overview)).not.toMatch(/calor/i);
    });

    it('a partial workout says so, never "complete", and counts only completed sets', () => {
      let log = must(startWorkoutLog(plan, UPPER, { id: 'p', startedAt: START, weightUnit: 'kg' }));
      log = must(completeSet(log, { exercise: 0, set: 0 }, { weight: 60, reps: 8 }, START));
      log = must(skipExercise(log, 1));
      log = must(finishWorkout(log, new Date(Date.parse(START) + 20 * 60_000).toISOString()));
      const { overview } = toWorkoutSummaryScreen(log, []);
      expect(overview).toMatchObject({ fullyCompleted: false, heading: 'Workout finished', highlight: { tone: 'info', title: 'Partly completed' } });
      expect(overview.highlight.text).toBe('You completed 1 set; 21 sets were skipped or not done.');
      expect(Object.fromEntries(overview.stats.map((s) => [s.key, s.value]))).toMatchObject({
        exercises: '0 of 7',
        sets: '1 of 22',
        volume: '480',
        completion: '5%',
      });
    });

    it('leaves volume out when nothing weighted was logged (no zero invented)', () => {
      const log = workout('bw');
      const bodyweight = { ...log, exercises: log.exercises.map((e) => ({ ...e, logging: 'reps' as const })) };
      expect(toWorkoutSummaryScreen(bodyweight, []).overview.stats.map((s) => s.key)).not.toContain('volume');
    });
  });

  describe('exercise breakdown', () => {
    it('shows what was performed, in order, with loads and the domain volume', () => {
      const [first] = toWorkoutSummaryScreen(workout('w'), []).exercises;
      expect(first).toMatchObject({
        name: 'Bench Press',
        status: 'complete',
        statusLabel: 'Completed',
        setsLabel: '4 of 4 sets',
        performed: '10, 10, 10, 10 reps',
        load: '20 kg',
        volume: '800 kg volume',
        canOpen: true,
      });
    });

    it('marks partial and skipped exercises from the recorded sets; a skipped one has nothing to open', () => {
      const log = workout('w', { keep: (e, s) => e === 0 || (e === 1 && s === 0) });
      const [first, second, third] = toWorkoutSummaryScreen(log, []).exercises;
      expect(first.status).toBe('complete');
      expect(second).toMatchObject({ status: 'partial', statusLabel: '1 of 3 sets done', setsLabel: '1 of 3 sets', performed: '10 reps' });
      expect(third).toMatchObject({ status: 'skipped', performed: null, load: null, volume: null, canOpen: false });
    });
  });

  describe('insights', () => {
    it('with no earlier workout of the same kind: nothing compared, no trend, no best', () => {
      const insights = toWorkoutSummaryScreen(workout('w'), [workout('w')])!.insights!;
      expect(insights.previousCount).toBe(0);
      expect(insights.metrics.every((m) => m.change === null)).toBe(true);
      expect(insights.trend).toBeNull();
      expect(insights.best).toBeNull();
    });

    it('compares with the latest earlier workout of the same kind only', () => {
      const current = workout('now', { weight: 22 });
      const history = [
        current,
        workout('last', { start: daysBefore(7), weight: 20, minutes: 40 }),
        workout('older', { start: daysBefore(14), weight: 15 }),
        workout('other-type', { session: OTHER, start: daysBefore(2), weight: 100 }),
        workout('later', { start: '2026-10-09T09:00:00.000Z', weight: 50 }),
      ];
      expect(comparableWorkouts(current, history).map((w) => w.id)).toEqual(['last', 'older']);

      const insights = toWorkoutSummaryScreen(current, history).insights!;
      const metric = (key: string) => insights.metrics.find((m) => m.key === key)!;
      expect(metric('volume')).toMatchObject({ value: '4,180 kg', change: { direction: 'up', text: '10% vs last time' } });
      expect(metric('sets').change).toMatchObject({ direction: 'same', text: 'Same as last time' });
      expect(metric('duration').change).toMatchObject({ direction: 'up', text: '5% vs last time' });
      // Oldest first, this workout last.
      expect(insights.trend?.bars.map((b) => [b.value, b.current])).toEqual([
        ['2.9K', false],
        ['3.8K', false],
        ['4.2K', true],
      ]);
      expect(insights.trend?.bars.at(-1)?.height).toBe(1);
      expect(insights.best).toMatchObject({ title: 'New best volume' });
      expect(insights.best?.text).toContain('3 Upper Body A workouts');
    });

    it('claims no best when an earlier workout had as much volume or more', () => {
      const current = workout('now', { weight: 20 });
      const insights = toWorkoutSummaryScreen(current, [current, workout('same', { start: daysBefore(7), weight: 20 })]).insights!;
      expect(insights.best).toBeNull();
      expect(insights.metrics.find((m) => m.key === 'volume')?.change?.direction).toBe('same');
    });

    it('never compares volume across weight units', () => {
      const current = workout('now', { unit: 'lb', weight: 45 });
      const insights = toWorkoutSummaryScreen(current, [current, workout('kg', { start: daysBefore(7) })]).insights!;
      expect(insights.metrics.find((m) => m.key === 'volume')?.change).toBeNull();
      expect(insights.trend).toBeNull();
      expect(insights.best).toBeNull();
    });

    it('is null when history could not be read', () => {
      expect(toWorkoutSummaryScreen(workout('w'), null).insights).toBeNull();
    });
  });

  it.each([
    [20, 'Under 1 min'],
    [90, '2 min'],
    [42 * 60, '42 min'],
    [3600, '1 h'],
    [65 * 60, '1 h 5 min'],
  ])('formats %i seconds as %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });

  describe('page', () => {
    async function render(id: string, options: { view?: string; logs?: readonly WorkoutLog[]; prepare?: (logs: WorkoutLogService) => Promise<void> } = {}) {
      const storage = new MemoryKeyValueStorage();
      storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile: PROFILE }));
      storage.values.set('fitness.workout-logs', JSON.stringify({ version: 1, logs: options.logs ?? [] }));
      TestBed.configureTestingModule({
        providers: [provideIonicAngular(), provideRouter([]), { provide: KeyValueStorage, useValue: storage }, { provide: CLOCK, useValue: () => THURSDAY }],
      });
      const nav = TestBed.inject(NavController);
      const root = vi.spyOn(nav, 'navigateRoot').mockResolvedValue(true);
      const forward = vi.spyOn(nav, 'navigateForward').mockResolvedValue(true);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      await options.prepare?.(TestBed.inject(WorkoutLogService));
      const fixture = TestBed.createComponent(WorkoutSummaryPage);
      fixture.componentRef.setInput('workoutId', id);
      if (options.view) {
        fixture.componentRef.setInput('view', options.view);
      }
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('ion-footer button')].map((b) => b.textContent?.trim());
      const press = async (label: string) => {
        [...el.querySelectorAll<HTMLButtonElement>('ion-footer button')].find((b) => b.textContent?.trim() === label)!.click();
        await fixture.whenStable();
      };
      return { el, fixture, root, forward, navigate, buttons, press };
    }

    it('loads the finished workout by id (dark overview) and moves on to the breakdown', async () => {
      const { el, fixture, buttons, press, navigate, root } = await render('w', { logs: [workout('other', { start: daysBefore(1) }), workout('w')] });
      expect((fixture.nativeElement as HTMLElement).classList).toContain('fit-theme-immersive');
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Workout complete!');
      expect(el.querySelector('[data-testid="summary-name"]')?.textContent?.trim()).toBe('Upper Body A');
      expect(buttons()).toEqual(['View detailed breakdown', 'Back to home']);

      await press('View detailed breakdown');
      expect(navigate).toHaveBeenLastCalledWith('/workout/summary/w?view=exercises');
      await press('Back to home');
      expect(root).toHaveBeenLastCalledWith('/home');
    });

    it('the breakdown (light) lists performed exercises; one opens its progress', async () => {
      const { el, fixture, forward } = await render('w', { view: 'exercises', logs: [workout('w')] });
      expect((fixture.nativeElement as HTMLElement).classList).toContain('fit-theme-dashboard');
      expect(el.querySelectorAll('[data-testid="summary-exercises"] > li')).toHaveLength(7);
      expect(el.querySelector('[data-testid="summary-exercises-done"]')?.textContent?.trim()).toBe('All 7 exercises completed');
      el.querySelector<HTMLButtonElement>('[data-testid="summary-exercises"] button')!.click();
      expect(forward).toHaveBeenCalledWith(['/progress', 'exercise', 'barbell-bench-press']);
    });

    it('insights (dark): "Not enough history yet" without an earlier workout of the same kind', async () => {
      const { el } = await render('w', { view: 'insights', logs: [workout('w')] });
      expect(el.querySelector('[data-testid="insights-no-history"]')?.textContent).toContain('Not enough history yet');
      expect(el.querySelector('[data-testid="insights-best"]')).toBeNull();
      expect(el.querySelector('[data-testid="volume-trend"]')).toBeNull();
    });

    it('what’s next (light): the plan’s next workout, and each card and button goes where it says', async () => {
      const { el, fixture, buttons, press, root, forward } = await render('w', { view: 'next', logs: [workout('w')] });
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(el.querySelector('[data-testid="next-workout"]')?.textContent).toMatch(/Next workout\s+\S.*, (Friday|Saturday|Sunday|Monday)/);
      });
      expect(buttons()).toEqual(['Go to home', 'View workout plan']);

      el.querySelector<HTMLButtonElement>('[data-testid="next-workout"]')!.click();
      await vi.waitFor(() => expect(forward).toHaveBeenCalledWith(['/workout', 'session', expect.any(String)]));
      expect(root).toHaveBeenCalledWith('/workout');

      el.querySelector<HTMLButtonElement>('[data-testid="next-nutrition"]')!.click();
      await vi.waitFor(() => expect(root).toHaveBeenLastCalledWith('/nutrition'));
      el.querySelector<HTMLButtonElement>('[data-testid="next-progress"]')!.click();
      await vi.waitFor(() => expect(root).toHaveBeenLastCalledWith('/progress'));
      expect(el.querySelector('[data-testid="next-recover"]')?.tagName).not.toBe('BUTTON');

      await press('View workout plan');
      expect(root).toHaveBeenLastCalledWith('/workout');
      await press('Go to home');
      expect(root).toHaveBeenLastCalledWith('/home');
    });

    it('Back goes to the previous view', async () => {
      const { el, fixture, navigate } = await render('w', { view: 'insights', logs: [workout('w')] });
      el.querySelector<HTMLButtonElement>('button.back')!.click();
      await fixture.whenStable();
      expect(navigate).toHaveBeenCalledWith('/workout/summary/w?view=exercises', { replaceUrl: true });
    });

    it('an in-progress workout is never shown as finished', async () => {
      const { el } = await render('wl-active', {
        prepare: async (logs) => {
          await logs.start(UPPER);
        },
      });
      expect(el.querySelector('[data-testid="summary-not-found"]')).not.toBeNull();
      expect(el.textContent).not.toContain('Workout complete');
    });

    it('an unknown id shows a calm unavailable state with a way home', async () => {
      const { el, buttons } = await render('wl-missing', { view: 'insights' });
      expect(el.querySelector('[data-testid="summary-not-found"]')?.textContent).toContain('Summary unavailable');
      expect(buttons()).toEqual(['Back to home']);
      expect(el.querySelectorAll('h1')).toHaveLength(1);
    });
  });
});
