import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { CurrentAssessment, FitnessAssessmentService } from '../../core/calculations/fitness-assessment.service';
import { FitnessReviewService } from '../../core/fitness-review/fitness-review.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { MemoryKeyValueStorage } from '../../core/storage/testing/memory-key-value-storage';
import { CLOCK } from '../../core/time/clock';
import { BodyCompositionAssessment, MANUAL_INBODY_SOURCE } from '../../domain/body-composition';
import { MeasurementEntry, WeightEntry } from '../../domain/body-measurements';
import { UserFitnessProfile } from '../../domain/fitness-profile';
import { FoodEntryInput, createFoodEntry } from '../../domain/nutrition';
import { finishedLog, planFor } from '../../domain/workout-session/testing/workout-log-fixtures';
import { FitnessReviewPage } from './fitness-review.page';

// Synthetic data only. "Now" is Wednesday 14 October 2026; the default review is 5–11 October.
const NOW = new Date(2026, 9, 14, 9, 0);
const PROFILE: UserFitnessProfile = {
  primaryGoal: 'build-muscle',
  dateOfBirth: '1990-06-15',
  sex: 'male',
  height: { centimeters: 180 },
  weight: { kilograms: 80 },
  unitSystem: 'metric',
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  trainingLocation: 'gym',
  equipment: ['full-gym'],
  activityLevel: 'moderately-active',
  goalTarget: { targetWeight: null },
  updatedAt: '2026-10-01T09:00:00.000Z',
};
const TARGETS = {
  kind: 'ready',
  profile: {} as never,
  assessment: { targets: { calories: { finalKcal: 2400, status: 'normal' }, macros: { status: 'feasible', proteinGrams: 150, carbohydrateGrams: 280, fatGrams: 70 } } } as never,
} as CurrentAssessment;

let seq = 0;
const food = (date: string, overrides: Partial<FoodEntryInput> = {}) => {
  const r = createFoodEntry(
    { name: 'Rice bowl', quantity: 1, unit: 'serving', meal: 'lunch', calories: 600, proteinGrams: 30, carbohydrateGrams: 80, fatGrams: 15, ...overrides },
    { id: `f${++seq}`, date, now: `${date}T12:00:00.000Z` },
  );
  if (!r.ok) {
    throw new Error('fixture');
  }
  return r.value;
};
const weight = (date: string, kilograms: number): WeightEntry => ({ id: `w-${date}`, date, weight: { kilograms }, createdAt: `${date}T06:00:00.000Z`, updatedAt: `${date}T06:00:00.000Z` });
const tape = (date: string, waist: number): MeasurementEntry => ({ id: `m-${date}`, date, values: { waist: { centimeters: waist } }, createdAt: `${date}T06:00:00.000Z`, updatedAt: `${date}T06:00:00.000Z` });
const report = (date: string, bodyFat: number): BodyCompositionAssessment => ({
  id: `r-${date}`,
  date,
  source: MANUAL_INBODY_SOURCE,
  reported: { 'body-fat-percentage': { value: bodyFat, unit: '%' } },
  createdAt: `${date}T06:00:00.000Z`,
  updatedAt: `${date}T06:00:00.000Z`,
});

const PLAN = planFor();
const SESSION = PLAN.sessions.find((s) => s.kind === 'resistance')!.id;
const session = (month: number, day: number, w0: number) =>
  finishedLog({ plan: PLAN, sessionId: SESSION, startedAt: new Date(2026, month - 1, day, 18, 0), minutes: 45, entry: (e) => ({ weight: e === 0 ? w0 : 40, reps: 8, durationSeconds: 30 }) });

function configure(options: { profile?: UserFitnessProfile | null; seed?: boolean } = {}) {
  const storage = new MemoryKeyValueStorage();
  const profile = options.profile === undefined ? PROFILE : options.profile;
  if (profile) {
    storage.values.set('fitness.profile', JSON.stringify({ version: 2, profile }));
  }
  if (options.seed !== false) {
    const logs = [session(9, 28, 60), session(10, 6, 60), session(10, 8, 62.5), session(10, 13, 62.5)];
    storage.values.set('fitness.workout-logs', JSON.stringify({ version: 1, logs }));
    storage.values.set('fitness.nutrition-entries', JSON.stringify({ version: 1, entries: [food('2026-10-05', { proteinGrams: 60 }), food('2026-10-06', { proteinGrams: 60 }), food('2026-10-07', { proteinGrams: 60 })] }));
    storage.values.set('fitness.body-weight-entries', JSON.stringify({ version: 1, entries: [weight('2026-09-20', 81.4), weight('2026-10-10', 80.6)] }));
    storage.values.set('fitness.body-measurement-entries', JSON.stringify({ version: 1, entries: [tape('2026-09-20', 90), tape('2026-10-09', 89)] }));
    storage.values.set('fitness.body-composition-assessments', JSON.stringify({ version: 1, assessments: [report('2026-09-01', 22.4), report('2026-10-07', 21.6)] }));
  }
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      { provide: KeyValueStorage, useValue: storage },
      { provide: CLOCK, useValue: () => NOW },
      { provide: FitnessAssessmentService, useValue: { current: vi.fn().mockResolvedValue(profile ? TARGETS : { kind: 'no-profile' }) } },
    ],
  });
  const nav = TestBed.inject(NavController);
  return {
    storage,
    forward: vi.spyOn(nav, 'navigateForward').mockResolvedValue(true),
    url: vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true),
  };
}

async function settle(fixture: ComponentFixture<unknown>) {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

const clean = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const byTestId = (el: Element, id: string) => el.querySelector(`[data-testid="${id}"]`);
const click = (el: Element, id: string) => (byTestId(el, id) as HTMLButtonElement).click();
const buttonIn = (el: Element | null, label: string) => [...(el?.querySelectorAll('button') ?? [])].find((b) => clean(b) === label) as HTMLButtonElement | undefined;

async function render(options: { profile?: UserFitnessProfile | null; seed?: boolean; date?: string; before?: () => void } = {}) {
  const spies = configure(options);
  options.before?.();
  const fixture = TestBed.createComponent(FitnessReviewPage);
  if (options.date) {
    fixture.componentRef.setInput('date', options.date);
  }
  await settle(fixture);
  return { ...spies, fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Weekly Fitness Review page', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens on last week with an overview, explained actions and every section', async () => {
    const { el } = await render();
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Weekly review');
    expect(clean(byTestId(el, 'week-title'))).toBe('Last week');
    expect(clean(byTestId(el, 'week-range'))).toBe('Oct 5 – 11, 2026');
    expect(byTestId(el, 'last-week')).toBeNull();
    expect(clean(byTestId(el, 'review-summary'))).toMatch(/^You finished 2 of \d+ planned workouts, logged food on 3 of 7 days and your weight was 0\.8 kg lower over 4 weeks\.$/);
    expect(clean(byTestId(el, 'stat-weight'))).toBe('Weight, 4 weeks −0.8 kg');

    const actions = [...el.querySelectorAll('[data-testid=review-actions] li')];
    expect(actions.map((a) => a.getAttribute('data-testid'))).toEqual(['action-complete-workouts', 'action-protein', 'action-log-food']);
    expect(clean(actions[1])).toContain('On the 3 days you logged, protein averaged 60 g, below your 150 g daily target.');

    expect(clean(byTestId(el, 'improving'))).toMatch(/62\.5 kg × 8, up from 60 kg × 8/);
    expect(clean(byTestId(el, 'nutrition-calories'))).toBe('Calories 600 kcal a day target 2,400 kcal');
    expect(clean(byTestId(el, 'body-weight'))).toBe('−0.8 kg over 4 weeks 81.4 kg on Sep 20 → 80.6 kg on Oct 10, 2 weigh-ins');
    expect(clean(byTestId(el, 'body-measurements'))).toBe('Waist Sep 20 → Oct 9 −1.0 cm');
    expect(clean(byTestId(el, 'body-composition'))).toBe('Body fat percentage Sep 1 → Oct 7 −0.8%');
    expect(clean(byTestId(el, 'review-body'))).toContain('they don’t show fat or muscle change on their own');
    expect(clean(byTestId(el, 'announcement'))).toMatch(/^Weekly review, Oct 5 – 11, 2026\. You finished/);
  });

  it('moves between weeks, never past this week, and comes back to last week', async () => {
    const { el, fixture } = await render();
    click(el, 'previous-week');
    await settle(fixture);
    expect(clean(byTestId(el, 'week-title'))).toBe('Sep 28 – Oct 4, 2026');
    expect(clean(byTestId(el, 'review-training'))).toContain('1 of');
    click(el, 'last-week');
    await settle(fixture);
    expect(clean(byTestId(el, 'week-title'))).toBe('Last week');
    click(el, 'next-week');
    await settle(fixture);
    expect(clean(byTestId(el, 'week-title'))).toBe('This week');
    expect(clean(byTestId(el, 'review-summary'))).toMatch(/^So far this week, you finished 1 of \d+ planned workouts/);
    expect(clean(byTestId(el, 'review-actions'))).toContain('Focus for the rest of this week');
    expect((byTestId(el, 'next-week') as HTMLButtonElement).disabled).toBe(true);
    click(el, 'next-week');
    await settle(fixture);
    expect(clean(byTestId(el, 'week-title'))).toBe('This week');
  });

  it('a date query opens its week; a future date opens this week', async () => {
    expect(clean(byTestId((await render({ date: '2026-09-30' })).el, 'week-title'))).toBe('Sep 28 – Oct 4, 2026');
    TestBed.resetTestingModule();
    expect(clean(byTestId((await render({ date: '2027-03-01' })).el, 'week-title'))).toBe('This week');
  });

  it('every insight links to where it can be acted on', async () => {
    const { el, fixture, forward, url } = await render();
    const go = async (button: HTMLButtonElement | undefined) => {
      button!.click();
      await fixture.whenStable();
    };
    await go(buttonIn(byTestId(el, 'action-complete-workouts'), 'Open Workout'));
    expect(url).toHaveBeenLastCalledWith('/workout');
    await go(buttonIn(byTestId(el, 'action-protein'), 'Open Nutrition'));
    expect(url).toHaveBeenLastCalledWith('/nutrition');
    await go(buttonIn(byTestId(el, 'review-nutrition'), 'Open weekly nutrition'));
    expect(forward).toHaveBeenLastCalledWith(['/nutrition', 'week'], { queryParams: { date: '2026-10-05' } });
    await go(byTestId(el, 'improving')?.querySelector('button') as HTMLButtonElement);
    expect(forward).toHaveBeenLastCalledWith(['/you', 'progress', 'exercise', expect.any(String)]);
    await go(buttonIn(byTestId(el, 'review-body'), 'Weight history'));
    expect(forward).toHaveBeenLastCalledWith('/you/weight-history');
    await go(buttonIn(byTestId(el, 'review-body'), 'Measurements'));
    expect(forward).toHaveBeenLastCalledWith('/you/measurements');
    await go(buttonIn(byTestId(el, 'review-body'), 'InBody reports'));
    expect(forward).toHaveBeenLastCalledWith('/you/body-composition');
  });

  it('no records and no profile: explains what is missing and suggests only data-free actions', async () => {
    const { el } = await render({ profile: null, seed: false });
    expect(clean(byTestId(el, 'review-summary'))).toBe('Not much was recorded in this week, so there’s little to review yet.');
    expect(clean(byTestId(el, 'training-summary'))).toBe('No workouts finished in this week.');
    expect(clean(byTestId(el, 'review-nutrition'))).toContain('No food logged in this week.');
    expect(clean(byTestId(el, 'review-body'))).toContain('No weigh-ins in the last 4 weeks.');
    expect(byTestId(el, 'body-measurements-none')).not.toBeNull();
    expect(byTestId(el, 'body-composition-none')).not.toBeNull();
    const ids = [...el.querySelectorAll('[data-testid=review-actions] li')].map((a) => a.getAttribute('data-testid'));
    expect(ids).toEqual(['action-log-food', 'action-weigh-in', 'action-measure']);
    expect(el.textContent).not.toMatch(/target 2,400|NaN|undefined/);
  });

  it('error: a calm message and retry, nothing changed', async () => {
    const { el, fixture } = await render({ before: () => vi.spyOn(TestBed.inject(FitnessReviewService), 'review').mockRejectedValueOnce(new Error('storage')) });
    expect(clean(byTestId(el, 'review-error'))).toContain('We couldn\'t build your review');
    expect(clean(byTestId(el, 'announcement'))).toBe('We couldn\'t build your review');
    expect(el.textContent).not.toContain('storage');
    buttonIn(el, 'Try again')!.click();
    await settle(fixture);
    expect(byTestId(el, 'review-error')).toBeNull();
    expect(clean(byTestId(el, 'week-title'))).toBe('Last week');
  });

  it('loading: busy skeletons and an announcement', async () => {
    configure();
    vi.spyOn(TestBed.inject(FitnessReviewService), 'review').mockReturnValue(new Promise(() => undefined));
    const fixture = TestBed.createComponent(FitnessReviewPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(byTestId(el, 'review-loading')?.getAttribute('aria-busy')).toBe('true');
    expect(clean(byTestId(el, 'announcement'))).toBe('Loading your weekly review');
  });

  it('re-entering the page re-reads the records', async () => {
    const { fixture } = await render();
    const review = vi.spyOn(TestBed.inject(FitnessReviewService), 'review');
    const page = fixture.componentInstance;
    page.ionViewWillEnter();
    await settle(fixture);
    expect(review).not.toHaveBeenCalled();
    page.ionViewWillEnter();
    await settle(fixture);
    expect(review).toHaveBeenCalledTimes(1);
  });

  it('accessibility: one h1, labelled sections, named buttons, decorative icons hidden', async () => {
    const { el } = await render();
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    for (const section of el.querySelectorAll('section[aria-labelledby]')) {
      expect(clean(el.querySelector(`#${section.getAttribute('aria-labelledby')}`))).not.toBe('');
    }
    for (const button of el.querySelectorAll('button')) {
      expect(button.getAttribute('aria-label') || clean(button)).not.toBe('');
    }
    for (const icon of el.querySelectorAll('ion-icon')) {
      expect(icon.closest('[aria-hidden=true]')).not.toBeNull();
    }
    expect(byTestId(el, 'week-nav')?.getAttribute('aria-label')).toBe('Week');
    expect(byTestId(el, 'announcement')?.getAttribute('role')).toBe('status');
  });

  it('is read-only: opening and browsing weeks writes nothing', async () => {
    const { storage, el, fixture } = await render();
    const before = new Map(storage.values);
    click(el, 'previous-week');
    await settle(fixture);
    expect(new Map(storage.values)).toEqual(before);
  });
});
