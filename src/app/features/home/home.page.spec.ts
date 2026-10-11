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
import { WeightEntry, createWeightEntry } from '../../domain/body-measurements';
import { FoodEntry, FoodEntryInput, createFoodEntry } from '../../domain/nutrition';
import { WorkoutLog } from '../../domain/workout-session';
import { finishedLog } from '../../domain/workout-session/testing/workout-log-fixtures';
import { ACTIVITY_PROFILE, PROFILE, REST_PROFILE, planFor, profileWith } from '../workout/testing/workout-fixtures';
import { scheduleWeek } from '../workout/workout-view-model';
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
const weighIn = (id: string, date: string, weight: number): WeightEntry => {
  const r = createWeightEntry({ weight, unitSystem: 'metric', date }, { id, now: `${date}T07:00:00.000Z`, today: '2026-10-08' });
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
  readonly weights?: readonly WeightEntry[];
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
  { entries = [], targets = NORMAL, profile = PROFILE, history = [], weights = [], activeSession, before, unsettled = false }: Options = {},
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
  if (weights.length) {
    storage.values.set('fitness.body-weight-entries', JSON.stringify({ version: 1, entries: weights }));
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
const weekCard = (el: HTMLElement) => el.querySelector('app-week-activity-card');
const tile = (el: HTMLElement, key: 'train' | 'fuel' | 'body') => el.querySelector<HTMLButtonElement>(`[data-testid=home-tile-${key}]`);
/** Visible parts joined by a space (Angular drops whitespace between elements; CSS spaces them). */
const parts = (node: Element | null | undefined) => [...(node?.children ?? [])].map((c) => clean(c)).filter(Boolean).join(' ');
const tileValue = (el: HTMLElement, key: 'train' | 'fuel' | 'body') => parts(tile(el, key)?.querySelector('.tile-value'));
const ringText = (el: HTMLElement) => parts(el.querySelector('[data-testid=home-day-ring] .center'));
const buttonIn = (root: Element | null, label: string) =>
  [...(root?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) => clean(b) === label);

describe('HomePage', () => {
  it('renders the redesigned dashboard in the dashboard screen theme', async () => {
    const { el, fixture } = await render();
    expect(el.classList.contains('fit-theme-dashboard')).toBe(true);
    for (const heading of ['Your day', "Today's workout", 'Nutrition', 'This week']) {
      expect(el.textContent).toContain(heading);
    }
    // No made-up name in the greeting (the profile has none); the date sits above it.
    expect(clean(el.querySelector('h1'))).toBe('Good afternoon');
    expect(clean(el.querySelector('.kicker'))).toBe('Thursday, October 8');
    // Nothing the app doesn't record: no streaks, steps, sleep or recovery scores.
    expect(el.textContent).not.toMatch(/streak|steps|sleep|recover(y)? score/i);
    expect(fixture).toBeTruthy();
  });

  it('the profile button opens the You tab', async () => {
    const { el, fixture, navigateByUrl } = await render();
    const profile = el.querySelector<HTMLButtonElement>('[data-testid=home-profile]')!;
    expect(profile.getAttribute('aria-label')).toBe('You: profile and settings');
    profile.click();
    await fixture.whenStable();
    expect(navigateByUrl).toHaveBeenCalledWith('/you');
  });

  describe('goal (real profile)', () => {
    const pill = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[data-testid=home-goal]');

    it('shows the saved goal under the greeting, without progress or timelines', async () => {
      const { el } = await render({ profile: profileWith({ primaryGoal: 'lose-fat', goalTarget: { targetWeight: { kilograms: 74 } } }) });
      expect(clean(pill(el))).toBe('Lose fat');
      expect(pill(el)!.getAttribute('aria-label')).toBe('Goal: Lose fat. Review your details.');
      expect(clean(pill(el))).not.toMatch(/%|on track|progress|lost|gained/i);
      expect(el.textContent).not.toMatch(/Sample|Demo data/);
    });

    it('the goal opens the profile review', async () => {
      const { el, fixture, navigateByUrl } = await render();
      expect(clean(pill(el))).toBe('Build muscle');
      pill(el)!.click();
      await fixture.whenStable();
      expect(navigateByUrl).toHaveBeenCalledWith('/onboarding/review');
    });

    it('without a profile: no goal, a welcome, and setup from the featured card', async () => {
      const { el, fixture, navigateByUrl } = await render({ profile: null });
      expect(pill(el)).toBeNull();
      expect(clean(el.querySelector('h1'))).toBe('Welcome');
      buttonIn(workoutCard(el), 'Set up profile')!.click();
      await fixture.whenStable();
      expect(navigateByUrl).toHaveBeenCalledWith('/onboarding');
    });

    it('a profile that can’t be read only affects the goal, and can be retried', async () => {
      const { el, fixture } = await render({
        before: () => vi.spyOn(TestBed.inject(FitnessProfileService), 'load').mockRejectedValueOnce(new Error('storage')),
      });
      const error = el.querySelector<HTMLButtonElement>('[data-testid=home-goal-error]')!;
      expect(clean(error)).toContain("Couldn't load your goal");
      expect(pill(el)).toBeNull();
      expect(workoutCard(el)).not.toBeNull();
      expect(nutritionCard(el)).not.toBeNull();
      expect(weekCard(el)).not.toBeNull();
      error.click();
      await settle(fixture);
      expect(clean(pill(el))).toBe('Build muscle');
    });

    it('re-entering Home re-reads the goal (e.g. after editing the profile)', async () => {
      const { el, fixture } = await render();
      fixture.componentInstance.ionViewWillEnter();
      await TestBed.inject(FitnessProfileService).save(profileWith({ primaryGoal: 'get-stronger', updatedAt: '2026-10-08T10:00:00.000Z' }));
      fixture.componentInstance.ionViewWillEnter();
      await settle(fixture);
      expect(clean(pill(el))).toBe('Build strength');
    });
  });

  describe('your day (today’s training, fuel, body)', () => {
    it('a planned day: 0% of the planned sets, the Train tile opens the workout', async () => {
      const { el, fixture, forward } = await render();
      const ring = el.querySelector('[data-testid=home-day-ring]')!;
      const today = scheduleWeek(TestBed.inject(WorkoutPlanService).plan()!)[3]; // Thursday
      const sets = today?.kind === 'resistance' ? today.exercises.reduce((n, e) => n + e.sets, 0) : -1;
      expect(ring.getAttribute('aria-valuenow')).toBe('0');
      expect(ring.getAttribute('aria-valuemax')).toBe(String(sets));
      expect(ringText(el)).toBe('0% sets');
      expect(tileValue(el, 'train')).toBe(`0/${sets} sets`);
      expect(clean(el.querySelector('[data-testid=home-day-status]'))).toBe('Your workout is ready.');
      tile(el, 'train')!.click();
      await fixture.whenStable();
      expect(forward).toHaveBeenCalledWith(['/workout', 'session', today!.id]);
    });

    it('a workout in progress: the ring is its sets done, and Train resumes it', async () => {
      const { el, fixture, forward } = await render({ activeSession: 'day-1-upper' });
      const ring = el.querySelector('[data-testid=home-day-ring]')!;
      expect(ring.getAttribute('aria-valuetext')).toBe('0 of 22 sets done');
      expect(tileValue(el, 'train')).toBe('0/22 sets');
      expect(tile(el, 'train')!.getAttribute('aria-label')).toBe('Train: 0 of 22 sets done. Resume Upper Body A.');
      tile(el, 'train')!.click();
      await fixture.whenStable();
      expect(forward).toHaveBeenCalledWith(['/workout', 'session', 'day-1-upper', 'active']);
    });

    it('a workout finished today: done (from history), never re-offered as 0%', async () => {
      const { el } = await render({ history: [finishedLog({ plan: planFor(PROFILE), startedAt: new Date(2026, 9, 8, 7, 0), minutes: 40 })] });
      expect(ringText(el)).toBe('100% done');
      expect(tileValue(el, 'train')).toBe('Done');
      expect(clean(el.querySelector('[data-testid=home-day-status]'))).toBe('Workout done. Nice work.');
    });

    it('a rest day shows a state, not a percentage', async () => {
      const { el } = await render({ profile: REST_PROFILE });
      expect(el.querySelector('[data-testid=home-day-ring]')).toBeNull();
      expect(clean(el.querySelector('[data-testid=home-day-state]'))).toBe('Rest');
      expect(tileValue(el, 'train')).toBe('Rest');
    });

    it('Fuel is today’s calories against the target and opens Nutrition', async () => {
      const { el, fixture, navigateByUrl } = await render({ entries: [food('a', '2026-10-08', { calories: 1420 })] });
      expect(tileValue(el, 'fuel')).toBe('1,420 / 2,000 kcal');
      expect(tile(el, 'fuel')!.getAttribute('aria-label')).toBe('Fuel: 1,420 of 2,000 kcal, 580 kcal remaining. Open nutrition.');
      tile(el, 'fuel')!.click();
      await fixture.whenStable();
      expect(navigateByUrl).toHaveBeenCalledWith('/nutrition');
    });

    it('Fuel over target says so in words', async () => {
      const { el } = await render({ entries: [food('a', '2026-10-08', { calories: 2300 })] });
      expect(clean(tile(el, 'fuel')!.querySelector('.tile-note'))).toBe('Over target');
      expect(tile(el, 'fuel')!.querySelector('.bar')?.getAttribute('data-tone')).toBe('warning');
    });

    it('each part loads independently', async () => {
      const { el } = await render({
        unsettled: true,
        before: () => vi.spyOn(TestBed.inject(NutritionRepository), 'loadDay').mockReturnValue(new Promise(() => undefined)),
      });
      expect(el.querySelector('app-day-summary-card')?.getAttribute('aria-busy')).toBe('true');
      expect(tile(el, 'fuel')).toBeNull();
    });
  });

  describe('today’s workout (real plan)', () => {
    it('shows the session the plan assigns to today and starts it directly', async () => {
      const { el, fixture, forward } = await render();
      const card = workoutCard(el)!;
      expect(card.querySelector('fit-card')?.getAttribute('data-kind')).toBe('resistance');
      expect(card.querySelector('fit-card')?.getAttribute('data-tone')).toBe('ink');
      const title = clean(card.querySelector('.name'));
      expect(title).not.toBe('');
      expect([...card.querySelectorAll('.meta li')].map((li) => clean(li))).toEqual([
        expect.stringMatching(/^About \d+ min$/),
        expect.stringMatching(/^\d+ exercises$/),
      ]);
      // Body areas from the plan's exercises (as Workout Detail shows them).
      const areas = [...card.querySelectorAll('[data-testid=home-workout-areas] li')].map((li) => clean(li));
      expect(areas.length).toBeGreaterThan(0);
      expect(buttonIn(card, 'Start workout')?.getAttribute('data-variant')).toBe('primary');
      buttonIn(card, 'Start workout')!.click();
      await settle(fixture);
      const [path] = forward.mock.calls[0] as unknown as [string[]];
      expect(path.slice(0, 2)).toEqual(['/workout', 'session']);
      expect(path[3]).toBe('active');
      // The same session the Workout tab shows for today, now in progress.
      const plan = TestBed.inject(WorkoutPlanService).plan();
      expect(plan?.sessions.find((s) => s.id === path[2])?.kind).toBe('resistance');
      expect(TestBed.inject(WorkoutLogService).active()?.source.sessionId).toBe(path[2]);
    });

    it('a start that fails stays on Home and says so', async () => {
      const { el, fixture, forward } = await render({
        before: () => vi.spyOn(TestBed.inject(WorkoutLogService), 'start').mockResolvedValueOnce({ kind: 'unavailable' }),
      });
      buttonIn(workoutCard(el), 'Start workout')!.click();
      await settle(fixture);
      expect(forward).not.toHaveBeenCalled();
      expect(clean(workoutCard(el)!.querySelector('[role=status]'))).toBe("We couldn't start this workout. Please try again.");
    });

    it('a rest day shows rest and the next session, with a way to the plan', async () => {
      const { el, fixture, navigateByUrl } = await render({ profile: REST_PROFILE });
      const card = workoutCard(el)!;
      expect(clean(card.querySelector('.name'))).toBe('Rest Day');
      expect(clean(card.querySelector('[data-testid=home-workout-next]'))).toMatch(/^Next up: .+ on Friday\.$/);
      expect(buttonIn(card, 'Start workout')).toBeUndefined();
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
      expect(card.querySelector('[role=progressbar]')?.getAttribute('aria-valuetext')).toBe('0 of 22 sets done');
      const resume = buttonIn(card, 'Resume')!;
      expect(resume.getAttribute('aria-label')).toBe('Resume Upper Body A');
      resume.click();
      await fixture.whenStable();
      expect(forward).toHaveBeenCalledWith(['/workout', 'session', 'day-1-upper', 'active']);
    });

    it('follows the log service when a workout starts or is discarded (no separate state on Home)', async () => {
      const { el, fixture } = await render();
      expect(buttonIn(workoutCard(el), 'Resume')).toBeUndefined();
      const logs = TestBed.inject(WorkoutLogService);
      await logs.start('day-1-upper');
      fixture.detectChanges();
      expect(buttonIn(workoutCard(el), 'Resume')).toBeDefined();
      expect(tileValue(el, 'train')).toBe('0/22 sets');
      await logs.discard();
      fixture.detectChanges();
      expect(buttonIn(workoutCard(el), 'Start workout')).toBeDefined();
    });

    it('without a profile, the featured card offers setup (rest of Home still renders)', async () => {
      const { el } = await render({ profile: null });
      expect(clean(workoutCard(el)?.querySelector('.name'))).toBe('Let’s build your plan');
      expect(weekCard(el)).toBeNull();
      expect(nutritionCard(el)).not.toBeNull();
      expect(tileValue(el, 'train')).toBe('No plan');
    });

    it('a plan failure only affects the workout card, and can be retried', async () => {
      const { el, fixture } = await render({
        history: [workoutAt(7)],
        before: () => vi.spyOn(TestBed.inject(WorkoutPlanService), 'load').mockRejectedValueOnce(new Error('storage')),
      });
      const error = el.querySelector('[data-testid=home-workout-error]')!;
      expect(clean(error)).toContain("Couldn't load your plan");
      expect(workoutCard(el)).toBeNull();
      expect(nutritionCard(el)).not.toBeNull();
      expect(tile(el, 'fuel')).not.toBeNull();
      buttonIn(error, 'Try again')!.click();
      await settle(fixture);
      expect(buttonIn(workoutCard(el), 'Start workout')).toBeDefined();
      expect(weekCard(el)).not.toBeNull();
    });

    it('shows a loading state while the plan is read', async () => {
      const { el } = await render({
        unsettled: true,
        before: () => vi.spyOn(TestBed.inject(WorkoutPlanService), 'load').mockReturnValue(new Promise(() => undefined)),
      });
      expect(el.querySelector('[data-testid=home-workout-loading]')?.getAttribute('aria-busy')).toBe('true');
    });
  });

  describe('this week (real history)', () => {
    const count = (el: HTMLElement) => clean(el.querySelector('[data-testid=home-week-count]'));
    const states = (el: HTMLElement) => [...el.querySelectorAll('.chart .day')].map((d) => d.getAttribute('data-state'));

    it('counts this Monday–Sunday week against the plan, one bar per day, and opens Progress', async () => {
      const history = [workoutAt(4, 40), workoutAt(5, 50), workoutAt(7, 45)]; // Sun (last week), Mon, Wed
      const { el, fixture, forward } = await render({ history });
      expect(count(el)).toBe('2/4');
      expect(el.querySelector('[data-testid=home-week]')?.getAttribute('aria-label')).toMatch(/^This week: 2 of 4 workouts done\. Today, Thursday: /);
      // Mon done, Tue planned, Wed done (unplanned), Thu–Fri planned, weekend rest.
      expect(states(el)).toEqual(['done', 'planned', 'done', 'planned', 'planned', 'rest', 'rest']);
      expect(el.querySelector('.chart .day.today .letter')?.textContent).toBe('T');
      buttonIn(weekCard(el), 'This week')!.click();
      await fixture.whenStable();
      expect(forward).toHaveBeenCalledWith('/you/progress');
    });

    it('no completed workouts: nothing fabricated', async () => {
      const { el } = await render();
      expect(count(el)).toBe('0/4');
      expect(states(el)).not.toContain('done');
    });

    it('reads history once per load (week overview), not the full progress analysis', async () => {
      let spies: { overview: ReturnType<typeof vi.spyOn>; progress: ReturnType<typeof vi.spyOn> } | null = null;
      await render({
        history: [workoutAt(7)],
        before: () => {
          const history = TestBed.inject(WorkoutHistoryService);
          spies = { overview: vi.spyOn(history, 'weekOverview'), progress: vi.spyOn(history, 'progress') };
        },
      });
      expect(spies!.overview).toHaveBeenCalledTimes(1);
      expect(spies!.progress).not.toHaveBeenCalled();
    });

    it('a history failure only affects the week card, and can be retried', async () => {
      const { el, fixture } = await render({
        history: [workoutAt(7)],
        before: () => vi.spyOn(TestBed.inject(WorkoutHistoryService), 'weekOverview').mockResolvedValueOnce(null),
      });
      const error = el.querySelector('[data-testid=home-progress-error]')!;
      expect(clean(error)).toContain("Couldn't load your workouts");
      expect(workoutCard(el)).not.toBeNull();
      expect(nutritionCard(el)).not.toBeNull();
      buttonIn(error, 'Try again')!.click();
      await settle(fixture);
      expect(count(el)).toBe('1/4');
    });
  });

  it('re-entering Home re-reads workout and week (e.g. after finishing a workout)', async () => {
    const { el, fixture, storage } = await render({ history: [workoutAt(5)] });
    fixture.componentInstance.ionViewWillEnter(); // first entry: no reload
    expect(clean(el.querySelector('[data-testid=home-week-count]'))).toBe('1/4');

    storage.values.set(LOGS_KEY, JSON.stringify({ version: 1, logs: [workoutAt(5), workoutAt(7)] }));
    const plans = vi.spyOn(TestBed.inject(WorkoutPlanService), 'load');
    fixture.componentInstance.ionViewWillEnter(); // back on Home
    await settle(fixture);
    expect(clean(el.querySelector('[data-testid=home-week-count]'))).toBe('2/4');
    expect(plans).toHaveBeenCalledTimes(1);
  });

  describe('body (recorded weigh-ins)', () => {
    it('shows the latest weigh-in and the 30-day change, and opens weight history', async () => {
      const { el, fixture, forward } = await render({ weights: [weighIn('a', '2026-09-20', 79.6), weighIn('b', '2026-10-07', 78.4)] });
      expect(tileValue(el, 'body')).toBe('78.4 kg');
      expect(clean(tile(el, 'body')!.querySelector('.tile-note'))).toBe('−1.2 kg · 30 days');
      // A recorded value, not a target: no bar.
      expect(tile(el, 'body')!.querySelector('.bar')).toBeNull();
      tile(el, 'body')!.click();
      await fixture.whenStable();
      expect(forward).toHaveBeenCalledWith('/you/weight-history');
    });

    it('no weigh-ins: offers to log one (the profile weight is never shown as a weigh-in)', async () => {
      const { el, fixture, forward } = await render();
      expect(clean(tile(el, 'body'))).toContain('No weigh-ins yet');
      expect(clean(tile(el, 'body'))).not.toContain(String(PROFILE.weight.kilograms));
      tile(el, 'body')!.click();
      await fixture.whenStable();
      expect(forward).toHaveBeenCalledWith(['/you', 'weight-history', 'new']);
    });
  });

  it('Log food opens a new entry for today', async () => {
    const { el, fixture, forward } = await render();
    nutritionCard(el)!.querySelector<HTMLButtonElement>('button[aria-label="Log food"]')!.click();
    await fixture.whenStable();
    expect(forward).toHaveBeenCalledWith(['/nutrition', 'food', 'new'], { queryParams: { date: '2026-10-08' } });
  });

  it('pull to refresh re-reads every card and completes once they have settled', async () => {
    const { el, fixture } = await render();
    await TestBed.inject(NutritionService).add(
      { name: 'Wrap', quantity: 1, unit: 'piece', meal: 'lunch', calories: 455, proteinGrams: 30, carbohydrateGrams: 50, fatGrams: 12 },
      '2026-10-08',
    );
    const complete = vi.fn();
    const page = fixture.componentInstance as unknown as { refresh(e: { complete(): void }): Promise<void> };
    const done = page.refresh({ complete });
    await settle(fixture);
    await done;
    expect(complete).toHaveBeenCalledTimes(1);
    expect(tileValue(el, 'fuel')).toBe('455 / 2,000 kcal');
  });

  describe('nutrition (real data)', () => {
    const macros = (card: Element) =>
      ['protein', 'carbs', 'fat'].map((k) => clean(card.querySelector(`[data-testid=home-macro-${k}] .ring-value, [data-testid=home-macro-${k}] .macro-value`)));

    it('shows today’s logged totals against valid targets (other days excluded)', async () => {
      const { el } = await render({
        entries: [
          food('a', '2026-10-08', { calories: 420, proteinGrams: 30 }),
          food('b', '2026-10-08', { meal: 'lunch', calories: 1000, proteinGrams: 32, carbohydrateGrams: 100.5, fatGrams: 20 }),
          food('y', '2026-10-07', { calories: 900 }),
        ],
      });
      const card = nutritionCard(el)!;
      expect(tileValue(el, 'fuel')).toBe('1,420 / 2,000 kcal');
      expect(macros(card)).toEqual(['62 g', '140.5 g / 220 g', '24 g / 65 g']);
      expect(clean(card.querySelector('.ring-target'))).toBe('of 140 g');
      expect(card.querySelector('[data-testid=home-macro-protein] [role=progressbar]')?.getAttribute('aria-label')).toBe('Protein');
      expect(card.querySelector('[data-testid=target-note]')).toBeNull();
    });

    it('an empty day shows zero intake, without inventing food', async () => {
      const { el } = await render();
      expect(tileValue(el, 'fuel')).toBe('0 / 2,000 kcal');
      expect(clean(nutritionCard(el)!.querySelector('[data-testid=home-macro-protein] .ring-value'))).toBe('0 g');
    });

    it('review-required targets: intake only, a note and a path to Nutrition', async () => {
      const { el, fixture } = await render({
        entries: [food('a', '2026-10-08')],
        targets: assessment({ finalKcal: 1100, status: 'review-required' }, { status: 'feasible', proteinGrams: 1, carbohydrateGrams: 1, fatGrams: 1 }),
      });
      const card = nutritionCard(el)!;
      expect(tileValue(el, 'fuel')).toBe('230 kcal');
      expect(tile(el, 'fuel')!.querySelector('.bar')).toBeNull();
      expect(el.textContent).not.toContain('1,100');
      expect(card.querySelector('[role=progressbar]')).toBeNull();
      expect(clean(card.querySelector('[data-testid=target-note] p'))).toBe('Your targets need review.');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      buttonIn(card, 'Review')!.click();
      await fixture.whenStable();
      expect(navigate).toHaveBeenCalledWith('/nutrition');
    });

    it('unavailable targets are explained, not invented', async () => {
      const { el } = await render({ targets: { kind: 'unavailable' } });
      expect(clean(nutritionCard(el)!.querySelector('[data-testid=target-note] p'))).toBe("Targets aren't available right now.");
      expect(tileValue(el, 'fuel')).toBe('0 kcal');
    });

    it('the card title opens Nutrition', async () => {
      const { el, fixture, navigateByUrl } = await render();
      buttonIn(nutritionCard(el), 'Nutrition')!.click();
      await fixture.whenStable();
      expect(navigateByUrl).toHaveBeenCalledWith('/nutrition');
    });

    it('refreshes when Home is re-entered (e.g. after logging food)', async () => {
      const { el, fixture } = await render();
      fixture.componentInstance.ionViewWillEnter(); // first entry
      expect(tileValue(el, 'fuel')).toBe('0 / 2,000 kcal');

      await TestBed.inject(NutritionService).add({ name: 'Wrap', quantity: 1, unit: 'piece', meal: 'lunch', calories: 455, proteinGrams: 30, carbohydrateGrams: 50, fatGrams: 12 }, '2026-10-08');
      fixture.componentInstance.ionViewWillEnter(); // back from Nutrition
      await settle(fixture);
      expect(tileValue(el, 'fuel')).toBe('455 / 2,000 kcal');
      expect(clean(nutritionCard(el)!.querySelector('[data-testid=home-macro-protein] .ring-value'))).toBe('30 g');
    });

    it('a Nutrition failure only affects its card and the Fuel tile, and can be retried', async () => {
      const { el, fixture } = await render({
        entries: [food('a', '2026-10-08')],
        before: () => vi.spyOn(TestBed.inject(NutritionRepository), 'loadDay').mockRejectedValueOnce(new Error('boom')),
      });
      expect(clean(el.querySelector('[data-testid=home-nutrition-error]'))).toContain("Couldn't load nutrition");
      expect(nutritionCard(el)).toBeNull();
      expect(clean(tile(el, 'fuel')!.querySelector('.tile-note'))).toBe('Couldn’t load');
      expect(workoutCard(el)).not.toBeNull();
      expect(weekCard(el)).not.toBeNull();
      el.querySelector<HTMLButtonElement>('[data-testid=home-nutrition-error] button')!.click();
      await settle(fixture);
      expect(tileValue(el, 'fuel')).toBe('230 / 2,000 kcal');
      expect(nutritionCard(el)).not.toBeNull();
    });

    it('shows a loading state for the card while reading', async () => {
      const { el } = await render({
        unsettled: true,
        before: () => vi.spyOn(TestBed.inject(NutritionRepository), 'loadDay').mockReturnValue(new Promise(() => undefined)),
      });
      expect(el.querySelector('[data-testid=home-nutrition-loading]')?.getAttribute('aria-busy')).toBe('true');
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
