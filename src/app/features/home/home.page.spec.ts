import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { CurrentAssessment, FitnessAssessmentService } from '../../core/calculations/fitness-assessment.service';
import { NutritionRepository } from '../../core/nutrition/nutrition.repository';
import { NutritionService } from '../../core/nutrition/nutrition.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import { CLOCK } from '../../core/time/clock';
import { WorkoutHistoryService } from '../../core/workout/workout-history.service';
import { WorkoutLogService } from '../../core/workout/workout-log.service';
import { WorkoutPlanService } from '../../core/workout/workout-plan.service';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { FoodEntry, FoodEntryInput, createFoodEntry } from '../../domain/nutrition';
import { WorkoutLog } from '../../domain/workout-session';
import { finishedLog } from '../../domain/workout-session/testing/workout-log-fixtures';
import { ACTIVITY_PROFILE, PROFILE, REST_PROFILE, planFor, profileWith } from '../workout/testing/workout-fixtures';
import { HomePage } from './home.page';

/** Thursday 8 October 2026, 12:30 local: a training day for the 4-day plan. */
const NOW = new Date(2026, 9, 8, 12, 30);
const KEY = 'fitness.nutrition-entries';
const LOGS_KEY = 'fitness.workout-logs';
const food = (id: string, date: string, overrides: Partial<FoodEntryInput> = {}): FoodEntry => {
  const input: FoodEntryInput = { name: 'Oats', quantity: 60, unit: 'g', meal: 'breakfast', calories: 230, proteinGrams: 8, carbohydrateGrams: 40, fatGrams: 4, ...overrides };
  const r = createFoodEntry(input, { id, date, now: `${date}T08:00:00.000Z` });
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
};
/** Only the fields the nutrition target mapping reads. */
const assessment = (calories: object, macros: object): CurrentAssessment =>
  ({ kind: 'ready', profile: {} as never, assessment: { targets: { calories, macros } } as never });
const NORMAL = assessment({ finalKcal: 2000, status: 'normal' }, { status: 'feasible', proteinGrams: 140, carbohydrateGrams: 220, fatGrams: 65 });
/** A finished workout from this profile's plan, on a day of October 2026 at 18:00 local. */
const workoutAt = (day: number, minutes = 45) => finishedLog({ plan: planFor(PROFILE), startedAt: new Date(2026, 9, day, 18, 0), minutes });

interface Options {
  readonly entries?: readonly FoodEntry[];
  readonly targets?: CurrentAssessment;
  readonly profile?: UserFitnessProfile | null;
  readonly history?: readonly WorkoutLog[];
  /** Starts a workout for this plan session before rendering. */
  readonly activeSession?: string;
  readonly before?: () => void;
  /** For never-settling loads: render without waiting for stability. */
  readonly unsettled?: boolean;
}

async function settle(fixture: ComponentFixture<unknown>) {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

async function render(
  { entries = [], targets = NORMAL, profile = PROFILE, history = [], activeSession, before, unsettled = false }: Options = {},
) {
  const storage = new MemoryKeyValueStorage();
  if (entries.length) {
    storage.values.set(KEY, JSON.stringify({ version: 1, entries }));
  }
  if (profile) {
    storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile }));
  }
  if (history.length) {
    storage.values.set(LOGS_KEY, JSON.stringify({ version: 1, logs: history }));
  }
  const current = vi.fn<() => Promise<CurrentAssessment>>().mockResolvedValue(targets);
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => NOW },
      { provide: FitnessAssessmentService, useValue: { current } },
    ],
  });
  const forward = vi.spyOn(TestBed.inject(NavController), 'navigateForward').mockResolvedValue(true);
  const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  if (activeSession) {
    await TestBed.inject(WorkoutLogService).start(activeSession);
  }
  before?.();
  const fixture = TestBed.createComponent(HomePage);
  if (unsettled) {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
  } else {
    await settle(fixture);
  }
  return { fixture, storage, current, forward, navigateByUrl, el: fixture.nativeElement as HTMLElement };
}

const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const nutritionCard = (el: HTMLElement) => el.querySelector('app-nutrition-summary-card');
const workoutCard = (el: HTMLElement) => el.querySelector('app-today-workout-card');
const progressCard = (el: HTMLElement) => el.querySelector('app-progress-summary-card');
const buttonIn = (root: Element | null, label: string) =>
  [...(root?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) => clean(b) === label);

describe('HomePage', () => {
  it('renders every dashboard section', async () => {
    const { el } = await render();
    for (const heading of ['Your goal', "Today's workout", 'Nutrition', 'Progress']) {
      expect(el.textContent).toContain(heading);
    }
    // No made-up name in the greeting (the profile has none).
    expect(clean(el.querySelector('.greeting'))).toBe('Good afternoon');
  });

  describe('goal (real profile)', () => {
    const goalCard = (el: HTMLElement) => el.querySelector('app-goal-summary-card');

    it('shows the saved goal; a goal that supports a target says none is set', async () => {
      const { el } = await render(); // build-muscle, no target weight
      const card = goalCard(el)!;
      expect(clean(card.querySelector('[data-testid=goal-title]'))).toBe('Build muscle');
      expect(clean(card.querySelector('.description'))).toBe('Add muscle size and definition');
      expect(clean(card.querySelector('[data-testid=goal-target]'))).toBe('No target weight set');
    });

    it('shows a saved target weight in the profile’s units, measured from the profile weight', async () => {
      const metric = await render({ profile: profileWith({ primaryGoal: 'lose-fat', goalTarget: { targetWeight: { kilograms: 74 } } }) });
      const card = goalCard(metric.el)!;
      expect(clean(card.querySelector('[data-testid=goal-title]'))).toBe('Lose fat');
      expect([...card.querySelectorAll('[data-testid=goal-target] p')].map((p) => clean(p))).toEqual([
        'Target weight 74 kg',
        'Lose 6 kg from your profile weight',
      ]);

      TestBed.resetTestingModule();
      const imperial = await render({
        profile: profileWith({ primaryGoal: 'lose-fat', unitSystem: 'imperial', goalTarget: { targetWeight: { kilograms: 74 } } }),
      });
      expect(clean(goalCard(imperial.el)!.querySelector('[data-testid=goal-target] p'))).toBe('Target weight 163.1 lb');
    });

    it('goals without targets show no target line at all', async () => {
      const { el } = await render({ profile: profileWith({ primaryGoal: 'get-stronger' }) });
      const card = goalCard(el)!;
      expect(clean(card.querySelector('[data-testid=goal-title]'))).toBe('Build strength');
      expect(card.querySelector('[data-testid=goal-target]')).toBeNull();
    });

    it('never shows fabricated progress, timelines or a Sample/demo label', async () => {
      const { el } = await render({ profile: profileWith({ primaryGoal: 'lose-fat', goalTarget: { targetWeight: { kilograms: 74 } } }) });
      const card = goalCard(el)!;
      expect(card.querySelector('fit-progress, [role=progressbar], fit-chip')).toBeNull();
      expect(clean(card)).not.toMatch(/week \d|%|on track|progress|lost|gained/i);
      expect(el.querySelector('[data-testid=goal-sample]')).toBeNull();
      expect(el.textContent).not.toMatch(/Sample|Demo data/);
    });

    it('Review my details opens the profile review', async () => {
      const { el, fixture, navigateByUrl } = await render();
      buttonIn(goalCard(el), 'Review my details')!.click();
      await fixture.whenStable();
      expect(navigateByUrl).toHaveBeenCalledWith('/onboarding/review');
    });

    it('without a profile, offers to set one up', async () => {
      const { el, fixture, navigateByUrl } = await render({ profile: null });
      const card = goalCard(el)!;
      expect(clean(card.querySelector('.title'))).toBe('Set your goal');
      buttonIn(card, 'Set up profile')!.click();
      await fixture.whenStable();
      expect(navigateByUrl).toHaveBeenCalledWith('/onboarding');
    });

    it('a profile that can’t be read only affects the goal card, and can be retried', async () => {
      const { el, fixture } = await render({
        before: () => vi.spyOn(TestBed.inject(FitnessProfileService), 'load').mockRejectedValueOnce(new Error('storage')),
      });
      const error = el.querySelector('[data-testid=home-goal-error]')!;
      expect(clean(error)).toContain("Couldn't load your goal");
      expect(goalCard(el)).toBeNull();
      expect(workoutCard(el)).not.toBeNull();
      expect(nutritionCard(el)).not.toBeNull();
      expect(progressCard(el)).not.toBeNull();
      buttonIn(error, 'Try again')!.click();
      await settle(fixture);
      expect(clean(goalCard(el)?.querySelector('[data-testid=goal-title]'))).toBe('Build muscle');
    });

    it('re-entering Home re-reads the goal (e.g. after editing the profile)', async () => {
      const { el, fixture } = await render();
      fixture.componentInstance.ionViewWillEnter();
      await TestBed.inject(FitnessProfileService).save(profileWith({ primaryGoal: 'get-stronger', updatedAt: '2026-10-08T10:00:00.000Z' }));
      fixture.componentInstance.ionViewWillEnter();
      await settle(fixture);
      expect(clean(goalCard(el)?.querySelector('[data-testid=goal-title]'))).toBe('Build strength');
    });
  });

  describe('today’s workout (real plan)', () => {
    it('shows the session the plan assigns to today and opens its detail', async () => {
      const { el, fixture, forward } = await render();
      const card = workoutCard(el)!;
      expect(card.querySelector('fit-card')?.getAttribute('data-kind')).toBe('resistance');
      const title = clean(card.querySelector('.name'));
      expect(title).not.toBe('');
      expect([...card.querySelectorAll('.meta li')].map((li) => clean(li))).toEqual([
        expect.stringMatching(/^\d+ exercises$/),
        expect.stringMatching(/^About \d+ min$/),
      ]);
      buttonIn(card, 'View Workout')!.click();
      await fixture.whenStable();
      const [path] = forward.mock.calls[0] as unknown as [string[]];
      expect(path.slice(0, 2)).toEqual(['/workout', 'session']);
      // The same session the Workout tab shows for today.
      const plan = TestBed.inject(WorkoutPlanService).plan();
      expect(plan?.sessions.find((s) => s.id === path[2])?.kind).toBe('resistance');
    });

    it('a rest day shows rest and the next session, with a way to the plan', async () => {
      const { el, fixture, navigateByUrl } = await render({ profile: REST_PROFILE });
      const card = workoutCard(el)!;
      expect(clean(card.querySelector('.name'))).toBe('Rest Day');
      expect(clean(card.querySelector('[data-testid=home-workout-next]'))).toMatch(/^Next up: .+ on Friday\.$/);
      expect(buttonIn(card, 'View Workout')).toBeUndefined();
      buttonIn(card, 'View plan')!.click();
      await fixture.whenStable();
      expect(navigateByUrl).toHaveBeenCalledWith('/workout');
    });

    it('an activity day offers the activity', async () => {
      const { el, fixture, forward } = await render({ profile: ACTIVITY_PROFILE });
      const card = workoutCard(el)!;
      expect(clean(card.querySelector('.name'))).toBe('Light Activity');
      buttonIn(card, 'View Activity')!.click();
      await fixture.whenStable();
      const [path] = forward.mock.calls[0] as unknown as [string[]];
      expect(TestBed.inject(WorkoutPlanService).plan()?.sessions.find((s) => s.id === path[2])?.kind).toBe('activity');
    });

    it('a workout in progress is offered for resuming (from the log service)', async () => {
      const { el, fixture, forward } = await render({ activeSession: 'day-1-upper' });
      const card = workoutCard(el)!;
      expect([...card.querySelectorAll('.eyebrow, .name, .focus')].map((n) => clean(n))).toEqual([
        'Workout in progress',
        'Upper Body A',
        '0 of 22 sets done',
      ]);
      buttonIn(card, 'Resume Workout')!.click();
      await fixture.whenStable();
      expect(forward).toHaveBeenCalledWith(['/workout', 'session', 'day-1-upper', 'active']);
    });

    it('follows the log service when a workout starts or is discarded (no separate state on Home)', async () => {
      const { el, fixture } = await render();
      expect(buttonIn(workoutCard(el), 'Resume Workout')).toBeUndefined();
      const logs = TestBed.inject(WorkoutLogService);
      await logs.start('day-1-upper');
      fixture.detectChanges();
      expect(buttonIn(workoutCard(el), 'Resume Workout')).toBeDefined();
      await logs.discard();
      fixture.detectChanges();
      expect(buttonIn(workoutCard(el), 'View Workout')).toBeDefined();
    });

    it('without a profile, says there is no plan yet (rest of Home still renders)', async () => {
      const { el } = await render({ profile: null });
      expect(clean(workoutCard(el)?.querySelector('.name'))).toBe('No plan yet');
      expect(nutritionCard(el)).not.toBeNull();
    });

    it('a plan failure only affects the workout card, and can be retried', async () => {
      const { el, fixture } = await render({
        history: [workoutAt(7)],
        before: () => vi.spyOn(TestBed.inject(WorkoutPlanService), 'load').mockRejectedValueOnce(new Error('storage')),
      });
      const error = el.querySelector('[data-testid=home-workout-error]')!;
      expect(clean(error)).toContain("Couldn't load your plan");
      expect(workoutCard(el)).toBeNull();
      expect(progressCard(el)).not.toBeNull();
      expect(nutritionCard(el)).not.toBeNull();
      buttonIn(error, 'Try again')!.click();
      await settle(fixture);
      expect(buttonIn(workoutCard(el), 'View Workout')).toBeDefined();
    });

    it('shows a loading state while the plan is read', async () => {
      const { el } = await render({
        unsettled: true,
        before: () => vi.spyOn(TestBed.inject(WorkoutPlanService), 'load').mockReturnValue(new Promise(() => undefined)),
      });
      expect(el.querySelector('[data-testid=home-workout-loading]')?.getAttribute('aria-busy')).toBe('true');
    });
  });

  describe('progress (real history)', () => {
    it('counts this Monday–Sunday week and links to the latest workout and Progress', async () => {
      const history = [workoutAt(4, 40), workoutAt(5, 50), workoutAt(7, 45)]; // Sun (last week), Mon, Wed
      const { el, fixture, forward } = await render({ history });
      const card = progressCard(el)!;
      expect(clean(card.querySelector('[data-testid=home-week-count]'))).toMatch(/2\s*workouts/);
      const last = card.querySelector<HTMLButtonElement>('[data-testid=home-last-workout]')!;
      expect(clean(last)).toMatch(/Yesterday · 45 min · Completed$/);
      last.click();
      await fixture.whenStable();
      expect(forward).toHaveBeenCalledWith(['/workout', 'history', history[2].id]);
      buttonIn(card, 'View progress')!.click();
      await fixture.whenStable();
      expect(forward).toHaveBeenCalledWith('/you/progress');
    });

    it('no completed workouts: an empty state, no fabricated numbers', async () => {
      const { el } = await render();
      const card = progressCard(el)!;
      expect(clean(card)).toContain('No completed workouts yet');
      expect(card.querySelector('[data-testid=home-week-count]')).toBeNull();
      expect(card.querySelector('[data-testid=home-last-workout]')).toBeNull();
    });

    it('reads history once per load (overview), not the full progress analysis', async () => {
      let spies: { overview: ReturnType<typeof vi.spyOn>; progress: ReturnType<typeof vi.spyOn> } | null = null;
      await render({
        history: [workoutAt(7)],
        before: () => {
          const history = TestBed.inject(WorkoutHistoryService);
          spies = { overview: vi.spyOn(history, 'overview'), progress: vi.spyOn(history, 'progress') };
        },
      });
      expect(spies!.overview).toHaveBeenCalledTimes(1);
      expect(spies!.progress).not.toHaveBeenCalled();
    });

    it('a history failure only affects the progress card, and can be retried', async () => {
      const { el, fixture } = await render({
        history: [workoutAt(7)],
        before: () => vi.spyOn(TestBed.inject(WorkoutHistoryService), 'overview').mockResolvedValueOnce(null),
      });
      const error = el.querySelector('[data-testid=home-progress-error]')!;
      expect(clean(error)).toContain("Couldn't load your progress");
      expect(workoutCard(el)).not.toBeNull();
      expect(nutritionCard(el)).not.toBeNull();
      buttonIn(error, 'Try again')!.click();
      await settle(fixture);
      expect(progressCard(el)?.querySelector('[data-testid=home-last-workout]')).not.toBeNull();
    });
  });

  it('re-entering Home re-reads workout and progress (e.g. after finishing a workout)', async () => {
    const { el, fixture, storage } = await render({ history: [workoutAt(5)] });
    fixture.componentInstance.ionViewWillEnter(); // first entry: no reload
    expect(clean(progressCard(el)?.querySelector('[data-testid=home-week-count]'))).toMatch(/1\s*workout$/);

    storage.values.set(LOGS_KEY, JSON.stringify({ version: 1, logs: [workoutAt(5), workoutAt(7)] }));
    const plans = vi.spyOn(TestBed.inject(WorkoutPlanService), 'load');
    fixture.componentInstance.ionViewWillEnter(); // back on Home
    await settle(fixture);
    expect(clean(progressCard(el)?.querySelector('[data-testid=home-week-count]'))).toMatch(/2\s*workouts/);
    expect(plans).toHaveBeenCalledTimes(1);
  });

  describe('nutrition (real data)', () => {
    it('shows today’s logged totals against valid targets (other days excluded)', async () => {
      const { el } = await render({
        entries: [
          food('a', '2026-10-08', { calories: 420, proteinGrams: 30 }),
          food('b', '2026-10-08', { meal: 'lunch', calories: 1000, proteinGrams: 32, carbohydrateGrams: 100.5, fatGrams: 20 }),
          food('y', '2026-10-07', { calories: 900 }),
        ],
      });
      const card = nutritionCard(el)!;
      expect(clean(card.querySelector('[data-testid=calories-eaten]'))).toBe('1,420');
      expect(clean(card.querySelector('.remaining'))).toBe('580 kcal');
      expect(clean(card.querySelector('[data-testid=calories-target]'))).toBe('Daily target 2,000 kcal');
      expect(['protein', 'carbs', 'fat'].map((k) => clean(card.querySelector(`[data-testid=home-macro-${k}] .macro-value`)))).toEqual([
        '62 g / 140 g',
        '140.5 g / 220 g',
        '24 g / 65 g',
      ]);
      expect(card.querySelector('[data-testid=target-note]')).toBeNull();
    });

    it('an empty day shows zero intake, without inventing food', async () => {
      const { el } = await render();
      const card = nutritionCard(el)!;
      expect(clean(card.querySelector('[data-testid=calories-eaten]'))).toBe('0');
      expect(clean(card.querySelector('.remaining'))).toBe('2,000 kcal');
      expect(clean(card.querySelector('[data-testid=home-macro-protein] .macro-value'))).toBe('0 g / 140 g');
    });

    it('review-required targets: intake only, a note and a path to Nutrition', async () => {
      const { el, fixture } = await render({
        entries: [food('a', '2026-10-08')],
        targets: assessment({ finalKcal: 1100, status: 'review-required' }, { status: 'feasible', proteinGrams: 1, carbohydrateGrams: 1, fatGrams: 1 }),
      });
      const card = nutritionCard(el)!;
      expect(clean(card.querySelector('[data-testid=calories-eaten]'))).toBe('230');
      expect(clean(card.querySelector('[data-testid=calories-target]'))).toBe('Not available');
      expect(card.textContent).not.toContain('1,100');
      expect(clean(card.querySelector('[data-testid=target-note] p'))).toBe('Your targets need review.');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      card.querySelector<HTMLButtonElement>('[data-testid=target-note] button')!.click();
      await fixture.whenStable();
      expect(navigate).toHaveBeenCalledWith('/nutrition');
    });

    it('unavailable targets are explained, not invented', async () => {
      const { el } = await render({ targets: { kind: 'unavailable' } });
      expect(clean(nutritionCard(el)!.querySelector('[data-testid=target-note] p'))).toBe("Targets aren't available right now.");
      expect(nutritionCard(el)!.querySelector('.remaining')).toBeNull();
    });

    it('refreshes when Home is re-entered (e.g. after logging food)', async () => {
      const { el, fixture } = await render();
      fixture.componentInstance.ionViewWillEnter(); // first entry
      expect(clean(nutritionCard(el)!.querySelector('[data-testid=calories-eaten]'))).toBe('0');

      await TestBed.inject(NutritionService).add({ name: 'Wrap', quantity: 1, unit: 'piece', meal: 'lunch', calories: 455, proteinGrams: 30, carbohydrateGrams: 50, fatGrams: 12 }, '2026-10-08');
      fixture.componentInstance.ionViewWillEnter(); // back from Nutrition
      await settle(fixture);
      expect(clean(nutritionCard(el)!.querySelector('[data-testid=calories-eaten]'))).toBe('455');
      expect(clean(nutritionCard(el)!.querySelector('.remaining'))).toBe('1,545 kcal');
    });

    it('a Nutrition failure only affects its card', async () => {
      const { el, fixture } = await render({
        entries: [food('a', '2026-10-08')],
        before: () => vi.spyOn(TestBed.inject(NutritionRepository), 'loadDay').mockRejectedValueOnce(new Error('boom')),
      });
      expect(clean(el.querySelector('[data-testid=home-nutrition-error]'))).toContain("Couldn't load nutrition");
      expect(nutritionCard(el)).toBeNull();
      for (const heading of ['Your goal', "Today's workout", 'Progress']) {
        expect(el.textContent).toContain(heading);
      }
      el.querySelector<HTMLButtonElement>('[data-testid=home-nutrition-error] button')!.click();
      await settle(fixture);
      expect(clean(nutritionCard(el)!.querySelector('[data-testid=calories-eaten]'))).toBe('230');
    });

    it('shows a loading state for the card while reading', async () => {
      const { el } = await render({
        unsettled: true,
        before: () => vi.spyOn(TestBed.inject(NutritionRepository), 'loadDay').mockReturnValue(new Promise(() => undefined)),
      });
      expect(el.querySelector('[data-testid=home-nutrition-loading]')?.getAttribute('aria-busy')).toBe('true');
      expect(el.textContent).toContain('Your goal');
    });

    it('reading Home never changes the day selected in Nutrition', async () => {
      const service = () => TestBed.inject(NutritionService);
      const { fixture } = await render({ before: () => void service().load('2026-10-05') });
      fixture.componentInstance.ionViewWillEnter();
      fixture.componentInstance.ionViewWillEnter();
      await settle(fixture);
      expect(service().selectedDate()).toBe('2026-10-05');
    });
  });
});
