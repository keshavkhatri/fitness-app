import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { KeyValueStorage } from '../../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../../core/time/clock';
import { WorkoutLogService } from '../../../core/workout/workout-log.service';
import { WorkoutLog, completeSet, finishWorkout, skipExercise, startWorkoutLog } from '../../../domain/workout-session';
import { PROFILE, planFor } from '../testing/workout-fixtures';
import { formatDuration, toWorkoutSummaryView } from './workout-summary-view-model';
import { WorkoutSummaryPage } from './workout-summary.page';

const START = '2026-10-08T09:00:00.000Z';
const at = (minutes: number) => new Date(Date.parse(START) + minutes * 60_000).toISOString();
const must = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};
const started = (): WorkoutLog => must(startWorkoutLog(planFor(), 'day-1-upper', { id: 'wl', startedAt: START, weightUnit: 'kg' }));
const finishedFully = (): WorkoutLog => {
  let log = started();
  log.exercises.forEach((e, ei) =>
    e.sets.forEach((_, si) => {
      log = must(completeSet(log, { exercise: ei, set: si }, { weight: 20, reps: 10 }, at(1)));
    }),
  );
  return must(finishWorkout(log, at(42)));
};

describe('workout summary', () => {
  describe('view model', () => {
    it('a fully completed workout', () => {
      expect(toWorkoutSummaryView(finishedFully())).toEqual({
        heading: 'Workout Complete',
        workoutName: 'Upper Body A',
        status: 'Every set completed',
        fullyCompleted: true,
        facts: [
          { key: 'duration', label: 'Duration', value: '42 min' },
          { key: 'exercises', label: 'Exercises', value: '7 of 7' },
          { key: 'completed', label: 'Sets completed', value: '22' },
          { key: 'skipped', label: 'Sets skipped', value: '0' },
        ],
      });
    });

    it('a partial workout says so and counts skipped and not-done sets separately', () => {
      let log = must(completeSet(started(), { exercise: 0, set: 0 }, { weight: 60, reps: 8 }, at(3)));
      log = must(skipExercise(log, 1));
      log = must(finishWorkout(log, at(20)));
      const view = toWorkoutSummaryView(log);
      expect(view).toMatchObject({ heading: 'Workout Finished', status: 'Finished with some sets not completed', fullyCompleted: false });
      expect(Object.fromEntries(view.facts.map((f) => [f.key, f.value]))).toEqual({
        duration: '20 min',
        exercises: '0 of 7',
        completed: '1',
        skipped: '3',
        incomplete: '18',
      });
    });

    it('never reports calories, volume or records', () => {
      expect(JSON.stringify(toWorkoutSummaryView(finishedFully()))).not.toMatch(/calor|volume|record|PR|streak/i);
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
  });

  describe('page', () => {
    async function render(id: string, prepare?: (logs: WorkoutLogService) => Promise<void>) {
      const storage = new MemoryKeyValueStorage();
      storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile: PROFILE }));
      let now = new Date(START);
      TestBed.configureTestingModule({
        providers: [provideIonicAngular(), provideRouter([]), { provide: KeyValueStorage, useValue: storage }, { provide: CLOCK, useValue: () => now }],
      });
      const root = vi.spyOn(TestBed.inject(NavController), 'navigateRoot').mockResolvedValue(true);
      const logs = TestBed.inject(WorkoutLogService);
      await prepare?.(logs);
      now = new Date(at(35));
      const fixture = TestBed.createComponent(WorkoutSummaryPage);
      fixture.componentRef.setInput('workoutId', id);
      await fixture.whenStable();
      fixture.detectChanges();
      return { el: fixture.nativeElement as HTMLElement, root, fixture };
    }

    it('renders the finished workout and returns to Workout on Done', async () => {
      const { el, root } = await render('wl-1791450000000-day-1-upper', async (logs) => {
        await logs.start('day-1-upper');
        await logs.completeSet({ exercise: 0, set: 0 }, { weight: 60, reps: 8 });
        await logs.finish();
      });
      expect(el.querySelector('h1')?.textContent?.trim()).toBe('Workout Finished');
      expect(el.querySelector('[data-testid="summary-name"]')?.textContent?.trim()).toBe('Upper Body A');
      const facts = [...el.querySelectorAll('.fact')].map((f) => [f.querySelector('dt')?.textContent?.trim(), f.querySelector('dd')?.textContent?.trim()]);
      expect(facts).toEqual([
        ['Duration', 'Under 1 min'],
        ['Exercises', '0 of 7'],
        ['Sets completed', '1'],
        ['Sets skipped', '0'],
        ['Sets not done', '21'],
      ]);
      [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Done')!.click();
      expect(root).toHaveBeenCalledWith('/workout');
    });

    it('an unknown workout id shows a calm unavailable state, still with Done', async () => {
      const { el } = await render('wl-missing');
      expect(el.querySelector('[data-testid="summary-not-found"]')?.textContent).toContain('Summary unavailable');
      expect([...el.querySelectorAll('button')].map((b) => b.textContent?.trim())).toContain('Done');
      expect(el.querySelectorAll('h1')).toHaveLength(1);
    });
  });
});
