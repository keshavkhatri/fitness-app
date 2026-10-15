import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { KeyValueStorage } from '../../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../../core/time/clock';
import { ThemeService } from '../../../core/theme/theme.service';
import { WorkoutLogService } from '../../../core/workout/workout-log.service';
import { UserFitnessProfile } from '../../../domain/fitness-profile';
import { HOME_PROFILE, PROFILE } from '../testing/workout-fixtures';
import { ActiveWorkoutPage } from './active-workout.page';
import { RestTimer } from './rest-timer';

interface DialogView {
  readonly title: string;
  readonly message: string;
  readonly actions: readonly { readonly label: string; run(): void | Promise<void> }[];
}

interface RenderOptions {
  profile?: UserFitnessProfile;
  sessionId?: string;
  /** Session to start before rendering; null starts nothing. */
  started?: string | null;
  /** Seconds between starting the workout and opening this screen (elapsed workout time). */
  openAfterSeconds?: number;
}

const ACTIVE_KEY = 'fitness.workout-active';

describe('ActiveWorkoutPage', () => {
  let now: Date;

  beforeEach(() => {
    now = new Date('2026-10-08T09:00:00.000Z');
  });

  async function render({ profile = PROFILE, sessionId = 'day-1-upper', started = sessionId, openAfterSeconds = 0 }: RenderOptions = {}) {
    const storage = new MemoryKeyValueStorage();
    storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile }));
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        provideRouter([]),
        { provide: KeyValueStorage, useValue: storage },
        { provide: CLOCK, useValue: () => now },
      ],
    });
    const nav = TestBed.inject(NavController);
    const root = vi.spyOn(nav, 'navigateRoot').mockResolvedValue(true);
    const back = vi.spyOn(nav, 'navigateBack').mockResolvedValue(true);
    const logs = TestBed.inject(WorkoutLogService);
    if (started) {
      await logs.start(started);
    }
    now = new Date(now.getTime() + openAfterSeconds * 1000);

    const fixture = TestBed.createComponent(ActiveWorkoutPage);
    fixture.componentRef.setInput('sessionId', sessionId);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const text = (testId: string) => clean(el.querySelector(`[data-testid="${testId}"]`));
    const rows = () => [...el.querySelectorAll<HTMLElement>('[data-testid="set-row"]')];
    const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('button')];
    const button = (label: string) => buttons().find((b) => clean(b) === label || b.getAttribute('aria-label') === label);
    const type = async (row: number, field: string, value: string) => {
      const input = rows()[row].querySelector<HTMLInputElement>(`input[data-field="${field}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    };
    const click = async (label: string) => {
      const target = button(label);
      if (!target) {
        throw new Error(`No button "${label}"`);
      }
      target.click();
      await settle();
    };
    const completeRow = async (row: number) => {
      rows()[row].querySelector<HTMLButtonElement>('[data-testid="set-action"]')!.click();
      await settle();
    };
    /** The open confirmation (its buttons live in an Ionic overlay jsdom doesn't render). */
    const dialog = () => (fixture.componentInstance as unknown as { dialog(): DialogView | null }).dialog();
    const choose = async (label: string) => {
      const action = dialog()?.actions.find((a) => a.label === label);
      if (!action) {
        throw new Error(`No dialog action "${label}"`);
      }
      await action.run();
      await settle();
    };
    /** Opens the options menu and picks an action (skip set, rest controls, finish, leave). */
    const menu = async (label: string) => {
      await click('More workout options');
      await choose(label);
    };
    /** The screen-reader text of a cell (the visible values sit beside it, hidden from AT). */
    const spoken = (testId: string) => clean(el.querySelector(`[data-testid="${testId}"] .visually-hidden`));
    const stored = () => JSON.parse(storage.values.get(ACTIVE_KEY) ?? 'null')?.log;

    return { fixture, el, storage, logs, root, back, settle, clean, text, spoken, rows, buttons, button, type, click, completeRow, dialog, choose, menu, stored };
  }

  describe('current exercise', () => {
    it('shows the workout, position, progress and the current exercise’s sets', async () => {
      const { el, text, rows } = await render();
      expect(text('workout-title')).toBe('Upper Body A');
      expect(text('position')).toBe('1 of 7 exercises');
      expect(el.querySelector('fit-progress')?.getAttribute('aria-valuetext')).toBe('Exercise 1 of 7. 0 of 22 sets done.');
      expect(el.querySelector('#active-exercise')?.textContent?.trim()).toBe('Bench Press');
      expect(text('planned')).toBe('Planned 4 sets · 6–10 reps · 120 sec rest');
      expect(rows()).toHaveLength(4);
      expect([...el.querySelectorAll('.head span')].map((s) => s.textContent?.trim())).toEqual(['Set', 'Weight (kg)', 'Reps', '']);
      const inputs = [...rows()[0].querySelectorAll('input')];
      expect(inputs.map((i) => i.getAttribute('aria-label'))).toEqual(['Set 1, weight in kilograms', 'Set 1, reps']);
      expect(inputs.map((i) => i.getAttribute('inputmode'))).toEqual(['decimal', 'numeric']);
    });

    it('bodyweight and timed exercises ask only for reps or seconds (no weight field)', async () => {
      const { el, rows, logs, settle } = await render({ profile: HOME_PROFILE, sessionId: 'day-1-full-body' });
      const log = logs.active()!;
      const pushUp = log.exercises.findIndex((e) => e.exerciseId === 'push-up');
      await logs.goToExercise(pushUp);
      await settle();
      expect([...rows()[0].querySelectorAll('input')].map((i) => i.dataset['field'])).toEqual(['reps']);

      const timed = log.exercises.findIndex((e) => e.logging === 'duration');
      await logs.goToExercise(timed);
      await settle();
      const input = rows()[0].querySelector('input')!;
      expect(input.dataset['field']).toBe('durationSeconds');
      expect(input.value).toBe('30'); // the planned time, so no typing is needed
      expect(el.querySelector('.head')?.textContent).toContain('Seconds');
    });
  });

  describe('logging sets', () => {
    it('completes a set: saved, shown as done with text and icon, announced, rest started, next set prefilled', async () => {
      const { rows, type, completeRow, text, spoken, stored, fixture } = await render();
      await type(0, 'weight', '60');
      await type(0, 'reps', '8');
      await completeRow(0);

      const row = rows()[0];
      expect(row.dataset['status']).toBe('completed');
      expect(spoken('set-result')).toBe('Done: 60 kg × 8');
      expect(row.querySelector('[data-testid="set-action"]')?.getAttribute('aria-label')).toBe('Set 1 done: 60 kg × 8. Undo');
      expect(text('announcement')).toBe('Set 1 completed.');
      expect(stored().exercises[0].sets[0]).toMatchObject({ status: 'completed', weight: 60, reps: 8 });

      expect(text('rest-time')).toContain('2:00');
      expect(fixture.debugElement.injector.get(RestTimer).status()).toBe('running');

      const next = [...rows()[1].querySelectorAll('input')].map((i) => i.value);
      expect(next).toEqual(['60', '8']);
    });

    it('accepts a decimal comma for weight', async () => {
      const { type, completeRow, stored } = await render();
      await type(0, 'weight', '22,5');
      await type(0, 'reps', '10');
      await completeRow(0);
      expect(stored().exercises[0].sets[0].weight).toBe(22.5);
    });

    it('invalid input: inline error, field marked invalid, nothing saved', async () => {
      const { rows, type, completeRow, text, stored } = await render();
      await type(0, 'reps', '8');
      await completeRow(0);
      expect(text('set-error')).toBe('Enter the weight you used.');
      expect(rows()[0].querySelector('[data-testid="set-error"]')?.getAttribute('role')).toBe('alert');
      expect(rows()[0].querySelector('input[data-field="weight"]')?.getAttribute('aria-invalid')).toBe('true');
      expect(rows()[0].dataset['status']).toBe('pending');
      expect(stored().exercises[0].sets[0].status).toBe('pending');

      await type(0, 'weight', '60');
      await completeRow(0);
      expect(text('set-error')).toBe('');
      expect(rows()[0].dataset['status']).toBe('completed');
    });

    it('undoing a completed set puts its values back for editing', async () => {
      const { rows, type, completeRow } = await render();
      await type(0, 'weight', '60');
      await type(0, 'reps', '8');
      await completeRow(0);
      await completeRow(0); // the same button undoes
      expect(rows()[0].dataset['status']).toBe('pending');
      expect([...rows()[0].querySelectorAll('input')].map((i) => i.value)).toEqual(['60', '8']);
    });

    it('skips a set (distinct from completed) and can undo the skip', async () => {
      const { rows, menu, text, spoken, stored, completeRow } = await render();
      await menu('Skip set 1'); // from the options menu
      expect(rows()[0].dataset['status']).toBe('skipped');
      expect(spoken('set-result')).toBe('Skipped');
      expect(text('announcement')).toBe('Set 1 skipped.');
      expect(stored().exercises[0].sets[0]).toMatchObject({ status: 'skipped', weight: null, reps: null });
      expect(rows()[0].querySelector('[data-testid="set-action"]')?.getAttribute('aria-label')).toBe('Set 1 skipped. Undo');

      await completeRow(0);
      expect(rows()[0].dataset['status']).toBe('pending');
    });

    it('a save failure keeps the workout going and shows a non-blocking notice', async () => {
      const { storage, type, completeRow, rows, text } = await render();
      storage.failWrites = true;
      await type(0, 'weight', '60');
      await type(0, 'reps', '8');
      await completeRow(0);
      expect(rows()[0].dataset['status']).toBe('completed');
      expect(text('not-saved')).toContain("Progress isn't being saved");
    });
  });

  describe('rest timer', () => {
    it('counts down programmed rest, can pause, resume, restart and skip, and announces completion', async () => {
      const { type, completeRow, fixture, text, click, menu, el, settle } = await render();
      await type(0, 'weight', '60');
      await type(0, 'reps', '8');
      await completeRow(0);
      const timer = fixture.debugElement.injector.get(RestTimer);

      now = new Date(now.getTime() + 30_000);
      timer.tick();
      await settle();
      expect(text('rest-time')).toContain('1:30');

      await click('Pause');
      now = new Date(now.getTime() + 60_000);
      timer.tick();
      await settle();
      expect(text('rest-time')).toContain('1:30');

      await click('Resume');
      await menu('Restart rest'); // restart and skip live in the options menu
      expect(text('rest-time')).toContain('2:00');

      now = new Date(now.getTime() + 121_000);
      timer.tick();
      await settle();
      expect(el.querySelector('#rest-title')?.textContent?.trim()).toBe('Rest complete');
      expect(text('announcement')).toBe('Rest complete. Ready for your next set.');

      await click('Dismiss');
      expect(el.querySelector('[data-testid="rest-timer"]')).toBeNull();
    });

    it('skipping rest never blocks logging the next set', async () => {
      const { type, completeRow, menu, el, rows } = await render();
      await type(0, 'weight', '60');
      await type(0, 'reps', '8');
      await completeRow(0);
      await completeRow(1); // log the next set while resting (prefilled)
      expect(rows()[1].dataset['status']).toBe('completed');
      await menu('Skip rest');
      expect(el.querySelector('[data-testid="rest-timer"]')).toBeNull();
    });

    it('no programmed rest means no timer', async () => {
      const { settle, el, fixture } = await render();
      const timer = fixture.debugElement.injector.get(RestTimer);
      timer.start(0);
      await settle();
      expect(timer.status()).toBe('idle');
      expect(el.querySelector('[data-testid="rest-timer"]')).toBeNull();
    });
  });

  describe('immersive screen', () => {
    it('is always dark: the immersive theme on the page, a dark status bar while it is open', async () => {
      const { fixture, el } = await render();
      const theme = TestBed.inject(ThemeService);
      theme.setPreference('light');
      expect(el.classList.contains('fit-theme-immersive')).toBe(true);
      expect(theme.statusBarTheme()).toBe('dark');
      expect(theme.preference()).toBe('light'); // the user's setting is untouched
      fixture.destroy();
      expect(theme.statusBarTheme()).toBe('light');
    });

    it('shows the exercise name, its muscles and equipment, and a demonstration area', async () => {
      const { el, text } = await render();
      expect(text('exercise-meta')).toBe('Chest');
      expect(el.querySelector('[data-testid="demo-stage"]')).not.toBeNull();
    });

    it('marks the current set, then the next one as it is completed; later sets stay editable', async () => {
      const { rows, type, completeRow } = await render();
      const current = () => rows().map((r) => r.getAttribute('aria-current'));
      expect(current()).toEqual(['step', null, null, null]);
      expect(rows()[0].textContent).toContain('Current set');
      expect(rows()[2].querySelector('input')?.disabled).toBe(false);

      await type(0, 'weight', '60');
      await type(0, 'reps', '8');
      await completeRow(0);
      expect(current()).toEqual([null, 'step', null, null]);
      expect(rows().map((r) => r.dataset['status'])).toEqual(['completed', 'pending', 'pending', 'pending']);
    });

    it('the footer completes the current set with what is typed (or prefilled)', async () => {
      const { rows, type, click, text, stored, fixture } = await render();
      await type(0, 'weight', '62,5');
      await type(0, 'reps', '8');
      await click('Complete set');
      expect(rows()[0].dataset['status']).toBe('completed');
      expect(stored().exercises[0].sets[0]).toMatchObject({ status: 'completed', weight: 62.5, reps: 8 });
      expect(fixture.debugElement.injector.get(RestTimer).status()).toBe('running');
      expect(text('announcement')).toBe('Set 1 completed.');

      await click('Complete set'); // set 2 is prefilled from set 1
      expect(stored().exercises[0].sets[1]).toMatchObject({ status: 'completed', weight: 62.5, reps: 8 });
    });

    it('the footer’s main action reports a missing value on the set instead of saving it', async () => {
      const { rows, click, text, stored } = await render();
      await click('Complete set');
      expect(rows()[0].dataset['status']).toBe('pending');
      expect(text('set-error')).toBe('Enter the weight you used.');
      expect(stored().exercises[0].sets[0].status).toBe('pending');
    });

    it('a set’s error goes away as soon as its input is edited, and returns if it is still invalid', async () => {
      const { rows, click, type, text, el, settle } = await render();
      await click('Complete set');
      expect(text('set-error')).toBe('Enter the weight you used.');
      await type(0, 'weight', '60');
      expect(el.querySelector('[data-testid="set-error"]')).toBeNull();
      expect(rows()[0].querySelector('input')?.getAttribute('aria-invalid')).toBeNull();
      await type(0, 'weight', '');
      await click('Complete set');
      expect(text('set-error')).toBe('Enter the weight you used.');
      await settle();
    });

    it('with every set handled, the footer’s one action is the next step (next exercise, or finishing)', async () => {
      const { el, text, logs, settle, click, dialog } = await render();
      await logs.skipExercise(0);
      await settle();
      expect(el.querySelector('[data-testid="complete-set"]')).toBeNull();
      expect(text('advance')).toBe('Next exercise');
      await click('Next exercise');
      expect(dialog()).toBeNull();
      expect(text('position')).toBe('2 of 7 exercises');

      await logs.goToExercise(6);
      await logs.skipExercise(6);
      await settle();
      expect(text('advance')).toBe('Finish workout');
    });

    it('previews the next exercise; the card moves on like the footer button (asking first)', async () => {
      const { text, click, dialog, choose } = await render();
      expect(text('next-up')).toContain('Next up');
      expect(text('next-up')).toContain('Barbell Row');
      await click('Next exercise: Barbell Row');
      expect(dialog()).toMatchObject({ title: 'Move to the next exercise?' });
      await choose('Next exercise');
      expect(text('position')).toBe('2 of 7 exercises');
    });

    it('on the last exercise the card is about finishing', async () => {
      const { logs, settle, text, click, dialog } = await render();
      await logs.goToExercise(6);
      await settle();
      expect(text('next-up')).toContain('Last exercise');
      await click('Last exercise. Finish workout');
      expect(dialog()).toMatchObject({ title: 'Finish workout?' });
    });

    it('rest can be started by hand from the rest card, using the programmed rest', async () => {
      const { text, click, fixture, el } = await render();
      expect(el.querySelector('[data-testid="rest-idle"]')).not.toBeNull();
      expect(text('rest-time')).toContain('2:00');
      await click('Start rest');
      expect(fixture.debugElement.injector.get(RestTimer).status()).toBe('running');
      expect(el.querySelector('[data-testid="rest-timer"]')).not.toBeNull();
    });

    it('shows the time since the workout started, measured from its start', async () => {
      const { text } = await render({ openAfterSeconds: 504 });
      expect(text('workout-time')).toContain('8:24');
      expect(text('workout-time')).toContain('Workout time: 8 minutes 24 seconds');
    });

    it('the options menu offers finishing, skipping this exercise and leaving, each still confirmed', async () => {
      const { click, dialog, choose } = await render();
      await click('More workout options');
      expect(dialog()?.title).toBe('Workout options');
      expect(dialog()?.actions.map((a) => a.label)).toEqual(['Skip set 1', 'Skip exercise', 'Finish workout', 'Leave workout', 'Keep working']);
      await choose('Leave workout');
      expect(dialog()).toMatchObject({ title: 'Leave this workout?' });
    });

    it('no skip option once this exercise has nothing left to skip', async () => {
      const { click, dialog, logs, settle } = await render();
      await logs.skipExercise(0);
      await settle();
      await click('More workout options');
      expect(dialog()?.actions.map((a) => a.label)).toEqual(['Finish workout', 'Leave workout', 'Keep working']);
    });
  });

  describe('moving between exercises', () => {
    it('Next asks for confirmation when sets are not done; Previous goes back', async () => {
      const { click, dialog, choose, menu, text, el } = await render();
      await click('More workout options');
      expect(dialog()?.actions.map((a) => a.label)).not.toContain('Previous exercise'); // nothing before the first exercise
      await choose('Keep working');
      await click('Next exercise');
      expect(dialog()).toMatchObject({ title: 'Move to the next exercise?', message: '4 sets are not done yet. You can come back to them before finishing.' });
      await choose('Next exercise');
      expect(text('position')).toBe('2 of 7 exercises');
      expect(el.querySelector('#active-exercise')?.textContent?.trim()).toBe('Barbell Row');
      expect(text('announcement')).toBe('Barbell Row. 2 of 7 exercises');

      await menu('Previous exercise'); // from the options menu
      expect(text('position')).toBe('1 of 7 exercises');
    });

    it('moves on directly when every set is handled', async () => {
      const { click, dialog, text, logs, settle } = await render();
      await logs.skipExercise(0);
      await settle();
      await click('Next exercise');
      expect(dialog()).toBeNull();
      expect(text('position')).toBe('2 of 7 exercises');
    });

    it('skipping an exercise needs confirmation, keeps completed sets and moves on', async () => {
      const { type, completeRow, click, dialog, choose, stored, text } = await render();
      await type(0, 'weight', '60');
      await type(0, 'reps', '8');
      await completeRow(0);
      await click('More workout options');
      await choose('Skip exercise'); // from the options menu
      expect(dialog()).toMatchObject({ title: 'Skip this exercise?', message: 'Your completed sets will be kept.' });
      await choose('Skip exercise');
      expect(stored().exercises[0].sets.map((s: { status: string }) => s.status)).toEqual(['completed', 'skipped', 'skipped', 'skipped']);
      expect(text('position')).toBe('2 of 7 exercises');
    });
  });

  describe('finishing and leaving', () => {
    it('Finish on the last exercise: incomplete sets are stated, Finish anyway completes and opens the summary', async () => {
      const { logs, settle, click, dialog, choose, root, storage } = await render();
      await logs.goToExercise(6);
      await settle();
      await click('Finish workout');
      expect(dialog()).toMatchObject({ title: 'Finish workout?', message: 'You have 22 incomplete sets.' });
      expect(dialog()?.actions.map((a) => a.label)).toEqual(['Finish anyway', 'Keep working']);

      await choose('Keep working');
      expect(logs.active()?.status).toBe('in-progress');

      await click('Finish workout');
      await choose('Finish anyway');
      const id = 'wl-1791450000000-day-1-upper';
      expect(root).toHaveBeenCalledWith(['/workout', 'summary', id]);
      expect(logs.active()).toBeNull();
      expect(JSON.parse(storage.values.get('fitness.workout-logs')!).logs[0]).toMatchObject({ id, status: 'completed' });
    });

    it('a fully completed workout gets a lighter confirmation', async () => {
      const { logs, settle, click, dialog } = await render();
      const log = logs.active()!;
      for (const [ei, e] of log.exercises.entries()) {
        for (const si of e.sets.keys()) {
          await logs.completeSet({ exercise: ei, set: si }, { weight: 20, reps: 10, durationSeconds: 30 });
        }
      }
      await logs.goToExercise(log.exercises.length - 1);
      await settle();
      await click('Finish workout');
      expect(dialog()).toMatchObject({ message: 'Every set is done. Nice work.' });
      expect(dialog()?.actions[0].label).toBe('Finish workout');
    });

    it('Exit keeps the workout in progress and returns to its detail; Discard needs a second confirmation', async () => {
      const { click, dialog, choose, back, root, logs, storage } = await render();
      await click('Exit workout');
      expect(dialog()?.title).toBe('Leave this workout?');
      await choose('Leave for now');
      expect(back).toHaveBeenCalledWith(['/workout', 'session', 'day-1-upper']);
      expect(logs.active()?.status).toBe('in-progress');

      await click('Exit workout');
      await choose('Discard workout');
      expect(dialog()?.title).toBe('Discard this workout?');
      await choose('Discard workout');
      expect(root).toHaveBeenCalledWith('/workout');
      expect(logs.active()).toBeNull();
      expect(storage.values.has(ACTIVE_KEY)).toBe(false);
    });
  });

  describe('states', () => {
    it('no workout in progress for this session: explains, with a way back', async () => {
      const { text, click, root } = await render({ started: null });
      expect(text('not-active')).toContain('No workout in progress');
      await click('Back to workout');
      expect(root).toHaveBeenCalledWith('/workout');
    });

    it('a different session’s workout is not shown under this route', async () => {
      const { text } = await render({ sessionId: 'day-3-upper', started: 'day-1-upper' });
      expect(text('not-active')).toContain('No workout in progress');
    });

    it('resumes an interrupted workout exactly where it was (new app session)', async () => {
      const first = await render();
      await first.type(0, 'weight', '60');
      await first.type(0, 'reps', '8');
      await first.completeRow(0);
      await first.logs.goToExercise(2);
      const storage = first.storage;

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideIonicAngular(), provideRouter([]), { provide: KeyValueStorage, useValue: storage }, { provide: CLOCK, useValue: () => now }],
      });
      const fixture = TestBed.createComponent(ActiveWorkoutPage);
      fixture.componentRef.setInput('sessionId', 'day-1-upper');
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="position"]')?.textContent?.trim()).toBe('3 of 7 exercises');
      expect(el.querySelector('fit-progress')?.getAttribute('aria-valuetext')).toBe('Exercise 3 of 7. 1 of 22 sets done.');
    });
  });

  describe('accessibility', () => {
    it('one h1 (workout) and an h2 for the current exercise', async () => {
      const { el } = await render();
      expect([...el.querySelectorAll('h1')].map((h) => h.textContent?.trim())).toEqual(['Upper Body A']);
      expect(el.querySelector('section[aria-labelledby="active-exercise"] h2')?.textContent?.trim()).toBe('Bench Press');
    });

    it('every button has an accessible name and explicit type', async () => {
      const { buttons, clean, type, completeRow } = await render();
      await type(0, 'weight', '60');
      await type(0, 'reps', '8');
      await completeRow(0); // includes the rest timer's buttons
      expect(buttons().length).toBeGreaterThan(8);
      for (const b of buttons()) {
        expect(clean(b) || b.getAttribute('aria-label'), b.outerHTML.slice(0, 80)).toBeTruthy();
        expect(b.getAttribute('type')).toBe('button');
      }
    });

    it('announcements use a polite live region', async () => {
      const { el } = await render();
      const region = el.querySelector('[data-testid="announcement"]');
      expect(region?.getAttribute('role')).toBe('status');
      expect(region?.getAttribute('aria-live')).toBe('polite');
    });
  });
});
