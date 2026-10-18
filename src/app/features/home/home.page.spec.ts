import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
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
import { DailyCheckInService } from '../../core/daily-check-in/daily-check-in.service';
import { CheckInSheetsComponent } from './components/check-in-sheets/check-in-sheets.component';
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
  /** The user's display name (and photo). */
  readonly name?: string | null;
  /** Steps and recovery per ISO date. */
  readonly checkIns?: { readonly steps?: Record<string, number>; readonly recovery?: Record<string, string> };
  /** Query params Home is opened with. */
  readonly query?: Record<string, string>;
  /** Starts a workout for this plan session before rendering. */
  readonly activeSession?: string;
  readonly before?: () => void;
  /** For never-settling loads: render without waiting for stability. */
  readonly unsettled?: boolean;
}

async function settle(fixture: ComponentFixture<unknown>) {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

async function render({
  entries = [],
  targets = NORMAL,
  profile = PROFILE,
  history = [],
  weights = [],
  name = null,
  checkIns,
  query,
  activeSession,
  before,
  unsettled = false,
}: Options = {}) {
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
  if (name) {
    storage.values.set('fitness.identity', JSON.stringify({ version: 1, name, photo: null }));
  }
  if (checkIns) {
    storage.values.set('fitness.daily-check-ins', JSON.stringify({ version: 1, steps: checkIns.steps ?? {}, recovery: checkIns.recovery ?? {} }));
  }
  const current = vi.fn<() => Promise<CurrentAssessment>>().mockResolvedValue(targets);
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => NOW },
      { provide: FitnessAssessmentService, useValue: { current } },
      ...(query ? [{ provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(query)) } }] : []),
    ],
  });
  const forward = vi.spyOn(TestBed.inject(NavController), 'navigateForward').mockResolvedValue(true);
  const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
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
  const sheets = () => fixture.debugElement.query(By.directive(CheckInSheetsComponent)).componentInstance as CheckInSheetsComponent;
  return { fixture, storage, current, forward, navigateByUrl, navigate, sheets, el: fixture.nativeElement as HTMLElement };
}

const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const nutritionCard = (el: HTMLElement) => el.querySelector('app-nutrition-summary-card');
const workoutCard = (el: HTMLElement) => el.querySelector('app-today-workout-card');
const weekCard = (el: HTMLElement) => el.querySelector('app-week-activity-card');
const tile = (el: HTMLElement, key: 'move' | 'train' | 'recover') => el.querySelector<HTMLButtonElement>(`[data-testid=home-tile-${key}]`);
/** Visible parts joined by a space (Angular drops whitespace between elements; CSS spaces them). */
const parts = (node: Element | null | undefined) => [...(node?.children ?? [])].map((c) => clean(c)).filter(Boolean).join(' ');
const tileValue = (el: HTMLElement, key: 'move' | 'train' | 'recover') => parts(tile(el, key)?.querySelector('.tile-value'));
const ring = (el: HTMLElement) => el.querySelector('[data-testid=home-day-ring]');
const buttonIn = (root: Element | null, label: string) =>
  [...(root?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) => clean(b) === label);

describe('HomePage', () => {
  describe('header', () => {
    it('renders the redesigned dashboard: wordmark, greeting with the saved name, dashboard theme', async () => {
      const { el } = await render({ name: 'Alex' });
      expect(el.classList.contains('fit-theme-dashboard')).toBe(true);
      expect(clean(el.querySelector('.brand'))).toBe('StokeForm');
      expect(parts(el.querySelector('h1'))).toBe('Good afternoon, Alex 👋');
      for (const heading of ['Your day, in motion', 'Recommended', 'Nutrition', 'This week']) {
        expect(el.textContent).toContain(heading);
      }
    });

    it('without a name: the greeting alone; without a profile: a welcome', async () => {
      expect(parts((await render()).el.querySelector('h1'))).toBe('Good afternoon 👋');
      TestBed.resetTestingModule();
      expect(parts((await render({ profile: null })).el.querySelector('h1'))).toBe('Welcome 👋');
    });

    it('the avatar opens You; it shows the name’s initial without a photo', async () => {
      const { el, fixture, navigateByUrl } = await render({ name: 'Alex Morgan' });
      const avatar = el.querySelector<HTMLButtonElement>('[data-testid=home-profile]')!;
      expect(avatar.getAttribute('aria-label')).toBe('You: profile and settings');
      expect(clean(avatar)).toBe('AM');
      avatar.click();
      await fixture.whenStable();
      expect(navigateByUrl).toHaveBeenCalledWith('/you');
    });

    it('the streak counts consecutive active days (steps, food, workouts…); none shows no chip', async () => {
      const steps = { '2026-10-05': 5000, '2026-10-06': 6000, '2026-10-07': 7000 }; // up to yesterday
      const { el } = await render({ checkIns: { steps }, entries: [food('a', '2026-10-08')] });
      expect(parts(el.querySelector('[data-testid=home-streak] .streak-text'))).toBe('4 day streak');
      TestBed.resetTestingModule();
      expect((await render()).el.querySelector('[data-testid=home-streak]')).toBeNull();
    });

    it('reminders come from the user’s data: a recent weigh-in and a check-in need no reminder', async () => {
      const { el } = await render({ weights: [weighIn('w', '2026-10-06', 78.4)], checkIns: { recovery: { '2026-10-08': 'good' } } });
      // Only the planned workout and the empty food log remain.
      expect(el.querySelector('[data-testid=home-notifications]')?.getAttribute('aria-label')).toBe('Notifications, 2 unread');
    });

    it('the bell shows unread reminders and opens the inbox', async () => {
      const { el, fixture, forward } = await render();
      const bell = el.querySelector<HTMLButtonElement>('[data-testid=home-notifications]')!;
      // Planned workout, recovery check-in, nothing eaten yet, no weigh-in.
      expect(bell.getAttribute('aria-label')).toBe('Notifications, 4 unread');
      expect(el.querySelector('[data-testid=home-notifications-dot]')).not.toBeNull();
      bell.click();
      await fixture.whenStable();
      expect(forward).toHaveBeenCalledWith('/home/notifications');
    });
  });

  describe('your day, in motion', () => {
    it('the ring is the mean of today’s goals (steps, planned workout, recovery)', async () => {
      const { el } = await render({ checkIns: { steps: { '2026-10-08': 8200 }, recovery: { '2026-10-08': 'good' } } });
      // (82% + 0% + 75%) / 3 = 52.3 → 52%.
      expect(ring(el)?.getAttribute('aria-valuenow')).toBe('52');
      expect(ring(el)?.getAttribute('aria-valuetext')).toBe("52% of today's goals");
      expect(parts(el.querySelector('[data-testid=home-day-ring] .center'))).toBe('52% Today');
      expect([tileValue(el, 'move'), tileValue(el, 'train'), tileValue(el, 'recover')]).toEqual(['8.2k steps', '0/1 done', 'Good']);
      expect(clean(el.querySelector('[data-testid=home-day-status]'))).toBe('Stay consistent. You’ve got this!');
    });

    it('nothing logged: 0, never invented', async () => {
      const { el } = await render();
      expect(ring(el)?.getAttribute('aria-valuenow')).toBe('0');
      expect([tileValue(el, 'move'), tileValue(el, 'recover')]).toEqual(['0 steps', 'Check in']);
    });

    it('a workout finished today counts as done', async () => {
      const { el } = await render({ history: [finishedLog({ plan: planFor(PROFILE), startedAt: new Date(2026, 9, 8, 7, 0), minutes: 40 })] });
      expect(tileValue(el, 'train')).toBe('1/1 done');
    });

    it('a rest day leaves Train out of the ring', async () => {
      const { el } = await render({ profile: REST_PROFILE, checkIns: { steps: { '2026-10-08': 10_000 } } });
      expect(tileValue(el, 'train')).toBe('Rest day');
      // (100% + 0%) / 2.
      expect(ring(el)?.getAttribute('aria-valuenow')).toBe('50');
    });

    it('Move opens the steps sheet; saving updates the tile and the ring', async () => {
      const { el, fixture, sheets } = await render();
      tile(el, 'move')!.click();
      fixture.detectChanges();
      expect(sheets().stepsOpen()).toBe(true);
      sheets().saveSteps.emit(9500);
      await settle(fixture);
      expect(sheets().stepsOpen()).toBe(false);
      expect(tileValue(el, 'move')).toBe('9.5k steps');
      expect(TestBed.inject(DailyCheckInService).checkIns().steps).toEqual({ '2026-10-08': 9500 });
    });

    it('Recover opens the check-in; choosing a level saves it', async () => {
      const { el, fixture, sheets } = await render();
      tile(el, 'recover')!.click();
      fixture.detectChanges();
      expect(sheets().recoveryOpen()).toBe(true);
      sheets().saveRecovery.emit('great');
      await settle(fixture);
      expect(sheets().recoveryOpen()).toBe(false);
      expect(tileValue(el, 'recover')).toBe('Great');
    });

    it('a failed save keeps the sheet open and says so', async () => {
      const { el, fixture, sheets } = await render({
        before: () => vi.spyOn(TestBed.inject(DailyCheckInService), 'setSteps').mockRejectedValueOnce(new Error('disk')),
      });
      tile(el, 'move')!.click();
      sheets().saveSteps.emit(9500);
      await settle(fixture);
      expect(sheets().stepsOpen()).toBe(true);
      expect(sheets().saveError()).toBe("Couldn't save. Try again.");
    });

    it('the inbox’s recovery reminder (?checkIn=recovery) opens the check-in', async () => {
      const { sheets, navigate } = await render({ query: { checkIn: 'recovery' } });
      expect(sheets().recoveryOpen()).toBe(true);
      expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: {}, replaceUrl: true }));
    });

    it('Train opens today’s workout, or resumes the one in progress', async () => {
      const { el, fixture, forward } = await render({ activeSession: 'day-1-upper' });
      tile(el, 'train')!.click();
      await fixture.whenStable();
      expect(forward).toHaveBeenCalledWith(['/workout', 'session', 'day-1-upper', 'active']);
    });
  });

  describe('today’s workout (real plan)', () => {
    it('shows the session the plan assigns to today, with real minutes, count and areas, and starts it directly', async () => {
      const { el, fixture, forward } = await render();
      const card = workoutCard(el)!;
      expect(card.querySelector('fit-card')?.getAttribute('data-kind')).toBe('resistance');
      expect(clean(card.querySelector('.eyebrow'))).toBe('Recommended');
      expect(clean(card.querySelector('.name'))).not.toBe('');
      expect([...card.querySelectorAll('.meta li')].map((li) => clean(li))).toEqual([
        expect.stringMatching(/^\d+ min$/),
        expect.stringMatching(/^\d+ exercises$/),
      ]);
      const areas = [...card.querySelectorAll('[data-testid=home-workout-areas] li')].map((li) => clean(li));
      expect(areas.length).toBeGreaterThan(0);
      expect(areas.length).toBeLessThanOrEqual(3);
      // No photo ships: the generated placeholder stands in.
      expect(card.querySelector('app-workout-art')).not.toBeNull();
      expect(buttonIn(card, 'Start workout')?.getAttribute('data-variant')).toBe('primary');
      buttonIn(card, 'Start workout')!.click();
      await settle(fixture);
      const [path] = forward.mock.calls[0] as unknown as [string[]];
      expect(path.slice(0, 2)).toEqual(['/workout', 'session']);
      expect(path[3]).toBe('active');
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
      expect(clean(card.querySelector('.name'))).toBe('Rest day');
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
      buttonIn(card, 'View activity')!.click();
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
      await logs.discard();
      fixture.detectChanges();
      expect(buttonIn(workoutCard(el), 'Start workout')).toBeDefined();
    });

    it('without a profile, the featured card offers setup (rest of Home still renders)', async () => {
      const { el, fixture, navigateByUrl } = await render({ profile: null });
      expect(clean(workoutCard(el)?.querySelector('.name'))).toBe('Let’s build your plan');
      expect(weekCard(el)).toBeNull();
      expect(nutritionCard(el)).not.toBeNull();
      expect(tileValue(el, 'train')).toBe('No plan');
      buttonIn(workoutCard(el), 'Set up profile')!.click();
      await fixture.whenStable();
      expect(navigateByUrl).toHaveBeenCalledWith('/onboarding');
    });

    it('a plan failure only affects the workout card, and can be retried', async () => {
      // Rejects for every reader (the inbox reads the plan too) until restored.
      let failing: { mockRestore(): void } | undefined;
      const { el, fixture } = await render({
        history: [workoutAt(7)],
        before: () => (failing = vi.spyOn(TestBed.inject(WorkoutPlanService), 'load').mockRejectedValue(new Error('storage'))),
      });
      failing!.mockRestore();
      const error = el.querySelector('[data-testid=home-workout-error]')!;
      expect(clean(error)).toContain("Couldn't load your plan");
      expect(workoutCard(el)).toBeNull();
      expect(nutritionCard(el)).not.toBeNull();
      expect(tile(el, 'move')).not.toBeNull();
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
      expect(el.querySelector('app-day-summary-card fit-card')?.getAttribute('aria-busy')).toBe('true');
    });
  });

  describe('this week (real history)', () => {
    const count = (el: HTMLElement) => clean(el.querySelector('[data-testid=home-week-count]'));
    const days = (el: HTMLElement) => [...el.querySelectorAll('.chart .day')];

    it('finished of planned workouts this Monday–Sunday week, one bar per day, and opens Progress', async () => {
      const history = [workoutAt(4, 40), workoutAt(5, 30), workoutAt(7, 60)]; // Sun (last week), Mon, Wed
      const { el, fixture, navigateByUrl } = await render({ history });
      expect(count(el)).toBe('2/4');
      expect(el.querySelector('[data-testid=home-week]')?.getAttribute('aria-label')).toMatch(/^This week: 2 of 4 workouts done\. Today, Thursday: /);
      expect(days(el).map((d) => d.getAttribute('data-state'))).toEqual(['done', 'planned', 'done', 'planned', 'planned', 'rest', 'rest']);
      // Done bars are as tall as the time trained: 60 min fills the bar, 30 min half of it.
      const heights = days(el).map((d) => (d.querySelector('.fill') as HTMLElement).style.height);
      expect([heights[0], heights[2]]).toEqual(['50%', '100%']);
      expect(clean(el.querySelector('.chart .day.today .letter'))).toBe('T');
      el.querySelector<HTMLButtonElement>('[data-testid=home-week-open]')!.click();
      await fixture.whenStable();
      expect(navigateByUrl).toHaveBeenCalledWith('/progress');
    });

    it('the weekly review is reachable from Home, with or without a plan', async () => {
      const { el, fixture, forward } = await render();
      const entry = el.querySelector<HTMLButtonElement>('[data-testid=review-entry]')!;
      expect(clean(entry)).toBe('Weekly review What went well and what to focus on next');
      entry.click();
      await fixture.whenStable();
      expect(forward).toHaveBeenCalledWith('/you/review');

      TestBed.resetTestingModule();
      const noPlan = await render({ profile: null });
      expect(noPlan.el.querySelector('[data-testid=review-entry]')).not.toBeNull();
    });

    it('no completed workouts: nothing fabricated', async () => {
      const { el } = await render();
      expect(count(el)).toBe('0/4');
      expect(days(el).map((d) => d.getAttribute('data-state'))).not.toContain('done');
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
      // Home's week card, and the inbox checking whether today's workout is done.
      expect(spies!.overview.mock.calls.length).toBeLessThanOrEqual(2);
      expect(spies!.progress).not.toHaveBeenCalled();
    });

    it('a history failure only affects the week card, and can be retried', async () => {
      let failing: { mockRestore(): void } | undefined;
      const { el, fixture } = await render({
        history: [workoutAt(7)],
        before: () => (failing = vi.spyOn(TestBed.inject(WorkoutHistoryService), 'weekOverview').mockResolvedValue(null)),
      });
      failing!.mockRestore();
      const error = el.querySelector('[data-testid=home-progress-error]')!;
      expect(clean(error)).toContain("Couldn't load your workouts");
      expect(workoutCard(el)).not.toBeNull();
      expect(nutritionCard(el)).not.toBeNull();
      buttonIn(error, 'Try again')!.click();
      await settle(fixture);
      expect(count(el)).toBe('1/4');
    });
  });

  it('re-entering Home re-reads workout, week and check-ins (e.g. after finishing a workout)', async () => {
    const { el, fixture, storage } = await render({ history: [workoutAt(5)] });
    fixture.componentInstance.ionViewWillEnter(); // first entry: no reload
    expect(clean(el.querySelector('[data-testid=home-week-count]'))).toBe('1/4');

    storage.values.set(LOGS_KEY, JSON.stringify({ version: 1, logs: [workoutAt(5), workoutAt(7)] }));
    storage.values.set('fitness.daily-check-ins', JSON.stringify({ version: 1, steps: { '2026-10-08': 4000 }, recovery: {} }));
    const plans = vi.spyOn(TestBed.inject(WorkoutPlanService), 'load');
    fixture.componentInstance.ionViewWillEnter(); // back on Home
    await settle(fixture);
    expect(clean(el.querySelector('[data-testid=home-week-count]'))).toBe('2/4');
    expect(tileValue(el, 'move')).toBe('4k steps');
    expect(plans).toHaveBeenCalled();
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
    expect(clean(nutritionCard(el)!.querySelector('[data-testid=calories-eaten]'))).toBe('455');
  });

  describe('nutrition (real data)', () => {
    it('shows today’s protein and calories against valid targets (other days excluded)', async () => {
      const { el } = await render({
        entries: [
          food('a', '2026-10-08', { calories: 420, proteinGrams: 30 }),
          food('b', '2026-10-08', { meal: 'lunch', calories: 1000, proteinGrams: 32, carbohydrateGrams: 100.5, fatGrams: 20 }),
          food('y', '2026-10-07', { calories: 900 }),
        ],
      });
      const card = nutritionCard(el)!;
      expect(clean(card.querySelector('.ring-value'))).toBe('62g');
      expect(clean(card.querySelector('.ring-target'))).toBe('of 140g');
      expect(card.querySelector('[data-testid=home-macro-protein] [role=progressbar]')?.getAttribute('aria-label')).toBe('Protein');
      expect(clean(card.querySelector('[data-testid=calories-eaten]'))).toBe('1,420');
      expect(clean(card.querySelector('[data-testid=calories-target]'))).toBe('/ 2,000 kcal');
      expect(card.querySelector('[data-testid=target-note]')).toBeNull();
    });

    it('an empty day shows zero intake, without inventing food', async () => {
      const { el } = await render();
      expect(clean(nutritionCard(el)!.querySelector('[data-testid=calories-eaten]'))).toBe('0');
      expect(clean(nutritionCard(el)!.querySelector('.ring-value'))).toBe('0g');
    });

    it('over target: a warning bar and the words "Over target"', async () => {
      const { el } = await render({ entries: [food('a', '2026-10-08', { calories: 2300 })] });
      const card = nutritionCard(el)!;
      expect(clean(card.querySelector('.over'))).toBe('Over target');
      expect(card.querySelector('.cal-bar')?.getAttribute('data-tone')).toBe('warning');
    });

    it('review-required targets: intake only, a note and a path to Nutrition', async () => {
      const { el, fixture, navigateByUrl } = await render({
        entries: [food('a', '2026-10-08')],
        targets: assessment({ finalKcal: 1100, status: 'review-required' }, { status: 'feasible', proteinGrams: 1, carbohydrateGrams: 1, fatGrams: 1 }),
      });
      const card = nutritionCard(el)!;
      expect(clean(card.querySelector('[data-testid=calories-eaten]'))).toBe('230');
      expect(clean(card.querySelector('[data-testid=calories-target]'))).toBe('kcal');
      expect(card.textContent).not.toContain('1,100');
      expect(card.querySelector('[role=progressbar]')).toBeNull();
      expect(clean(card.querySelector('[data-testid=target-note] p'))).toBe('Your targets need review.');
      buttonIn(card, 'Review')!.click();
      await fixture.whenStable();
      expect(navigateByUrl).toHaveBeenCalledWith('/nutrition');
    });

    it('unavailable targets are explained, not invented', async () => {
      const { el } = await render({ targets: { kind: 'unavailable' } });
      expect(clean(nutritionCard(el)!.querySelector('[data-testid=target-note] p'))).toBe("Targets aren't available right now.");
    });

    it('the card opens Nutrition', async () => {
      const { el, fixture, navigateByUrl } = await render();
      el.querySelector<HTMLButtonElement>('[data-testid=home-nutrition-open]')!.click();
      await fixture.whenStable();
      expect(navigateByUrl).toHaveBeenCalledWith('/nutrition');
    });

    it('refreshes when Home is re-entered (e.g. after logging food)', async () => {
      const { el, fixture } = await render();
      fixture.componentInstance.ionViewWillEnter(); // first entry
      await TestBed.inject(NutritionService).add({ name: 'Wrap', quantity: 1, unit: 'piece', meal: 'lunch', calories: 455, proteinGrams: 30, carbohydrateGrams: 50, fatGrams: 12 }, '2026-10-08');
      fixture.componentInstance.ionViewWillEnter(); // back from Nutrition
      await settle(fixture);
      expect(clean(nutritionCard(el)!.querySelector('[data-testid=calories-eaten]'))).toBe('455');
      expect(clean(nutritionCard(el)!.querySelector('.ring-value'))).toBe('30g');
    });

    it('a Nutrition failure only affects its card, and can be retried', async () => {
      let failing: { mockRestore(): void } | undefined;
      const { el, fixture } = await render({
        entries: [food('a', '2026-10-08')],
        before: () => (failing = vi.spyOn(TestBed.inject(NutritionRepository), 'loadDay').mockRejectedValue(new Error('boom'))),
      });
      failing!.mockRestore();
      expect(clean(el.querySelector('[data-testid=home-nutrition-error]'))).toContain("Couldn't load nutrition");
      expect(nutritionCard(el)).toBeNull();
      expect(workoutCard(el)).not.toBeNull();
      expect(weekCard(el)).not.toBeNull();
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
