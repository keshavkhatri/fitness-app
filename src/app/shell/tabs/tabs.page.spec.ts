import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular';

import { CLOCK } from '../../core/time/clock';
import { WorkoutLogService } from '../../core/workout/workout-log.service';
import { WorkoutPlanService, WorkoutPlanState } from '../../core/workout/workout-plan.service';
import { WorkoutLog } from '../../domain/workout-session';
import { finishedLog } from '../../domain/workout-session/testing/workout-log-fixtures';
import { PROFILE, SUNDAY, THURSDAY, planFor } from '../../features/workout/testing/workout-fixtures';
import { QuickAddLauncher } from '../quick-add/quick-add-launcher.service';
import { QuickAddSheetComponent } from '../quick-add/quick-add-sheet.component';
import { QUICK_ADD_ACTIONS, QuickAddAction } from '../quick-add/quick-add.actions';
import { TabsPage } from './tabs.page';

const action = (id: QuickAddAction['id']) => QUICK_ADD_ACTIONS.find((a) => a.id === id)!;

interface WorkoutState {
  /** What `WorkoutPlanService.load()` resolves to (or rejects with). */
  plan?: () => Promise<WorkoutPlanState>;
  active?: WorkoutLog | null;
}

const readyPlan = (): Promise<WorkoutPlanState> =>
  Promise.resolve({ kind: 'ready', plan: planFor(PROFILE), origin: 'stored', saved: true });

async function render(
  now: Date,
  navigate: () => Promise<boolean> = () => Promise.resolve(true),
  workout: WorkoutState = {},
) {
  let active: WorkoutLog | null = null;
  const logs = {
    loadActive: vi.fn(async () => (active = workout.active ?? null)),
    active: () => active,
    start: vi.fn(),
  };
  const plans = { load: vi.fn(workout.plan ?? readyPlan) };
  TestBed.configureTestingModule({
    providers: [
      provideIonicAngular(),
      provideRouter([]),
      { provide: CLOCK, useValue: () => now },
      { provide: WorkoutLogService, useValue: logs },
      { provide: WorkoutPlanService, useValue: plans },
    ],
  });
  const forward = vi.spyOn(TestBed.inject(NavController), 'navigateForward').mockImplementation(navigate);
  const byUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation(navigate);
  const fixture = TestBed.createComponent(TabsPage);
  fixture.detectChanges();
  const sheet = fixture.debugElement.query(By.directive(QuickAddSheetComponent)).componentInstance as QuickAddSheetComponent;
  /** What a tap on a sheet tile does. */
  const choose = async (id: QuickAddAction['id']) => {
    sheet.open.set(true);
    (sheet as unknown as { select(a: QuickAddAction): void }).select(action(id));
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
  };
  return { fixture, sheet, forward, byUrl, logs, plans, choose };
}

describe('Tab bar', () => {
  it('five destinations, as the redesign names them; route ids unchanged; no Quick Add button', async () => {
    const { fixture } = await render(THURSDAY);
    const el = fixture.nativeElement as HTMLElement;
    const tabs = [...el.querySelectorAll('ion-tab-button')];
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Home', 'Train', 'Fuel', 'Progress', 'You']);
    expect(tabs.map((t) => (t as HTMLIonTabButtonElement).tab)).toEqual(['home', 'workout', 'nutrition', 'progress', 'you']);
    expect(el.querySelector('.quick-add')).toBeNull();
  });

  it('the Quick Add sheet opens through the launcher (from the You tab)', async () => {
    const { fixture, sheet } = await render(THURSDAY);
    TestBed.inject(QuickAddLauncher).show();
    fixture.detectChanges();
    expect(sheet.open()).toBe(true);
  });
});

describe('Quick Add (tabs shell)', () => {
  it('Start workout, Add food, Log weight, Add measurement and Add InBody are available; other actions keep their state', () => {
    expect(QUICK_ADD_ACTIONS.map((a) => [a.id, a.available])).toEqual([
      ['start-workout', true],
      ['add-food', true],
      ['log-weight', true],
      ['add-measurement', true],
      ['upload-inbody', true],
      ['add-progress-photo', false],
    ]);
  });

  it('Add food closes the sheet and opens the existing food form for today (local date)', async () => {
    // 00:30 local on 9 Oct: still 8 Oct in UTC for zones east of UTC; the form must get the local date.
    const { sheet, forward, choose } = await render(new Date(2026, 9, 9, 0, 30));
    await choose('add-food');
    expect(sheet.open()).toBe(false);
    expect(forward).toHaveBeenCalledWith(['/nutrition', 'food', 'new'], { queryParams: { date: '2026-10-09' } });
  });

  it('if navigation doesn’t happen, the sheet reopens', async () => {
    const { sheet, choose } = await render(new Date(2026, 9, 8, 12), () => Promise.resolve(false));
    await choose('add-food');
    expect(sheet.open()).toBe(true);

    TestBed.resetTestingModule();
    const failing = await render(new Date(2026, 9, 8, 12), () => Promise.reject(new Error('nav')));
    await failing.choose('add-food');
    expect(failing.sheet.open()).toBe(true);
  });

  it('Log weight closes the sheet and opens the existing new weight entry form', async () => {
    const { sheet, forward, choose } = await render(new Date(2026, 9, 8, 12));
    await choose('log-weight');
    expect(sheet.open()).toBe(false);
    expect(forward).toHaveBeenCalledTimes(1);
    expect(forward).toHaveBeenCalledWith(['/you', 'weight-history', 'new']);
  });

  it('if Log weight navigation doesn’t happen, the sheet reopens', async () => {
    const { sheet, choose } = await render(new Date(2026, 9, 8, 12), () => Promise.resolve(false));
    await choose('log-weight');
    expect(sheet.open()).toBe(true);

    TestBed.resetTestingModule();
    const failing = await render(new Date(2026, 9, 8, 12), () => Promise.reject(new Error('nav')));
    await failing.choose('log-weight');
    expect(failing.sheet.open()).toBe(true);
  });

  it('Add measurement closes the sheet and opens the existing new measurement form', async () => {
    const { sheet, forward, choose } = await render(new Date(2026, 9, 8, 12));
    await choose('add-measurement');
    expect(sheet.open()).toBe(false);
    expect(forward).toHaveBeenCalledTimes(1);
    expect(forward).toHaveBeenCalledWith(['/you', 'measurements', 'new']);
  });

  it('if Add measurement navigation doesn’t happen, the sheet reopens', async () => {
    const { sheet, choose } = await render(new Date(2026, 9, 8, 12), () => Promise.resolve(false));
    await choose('add-measurement');
    expect(sheet.open()).toBe(true);

    TestBed.resetTestingModule();
    const failing = await render(new Date(2026, 9, 8, 12), () => Promise.reject(new Error('nav')));
    await failing.choose('add-measurement');
    expect(failing.sheet.open()).toBe(true);
  });

  it('Add InBody closes the sheet and opens the new body-composition assessment', async () => {
    const { sheet, forward, choose } = await render(new Date(2026, 9, 8, 12));
    await choose('upload-inbody');
    expect(sheet.open()).toBe(false);
    expect(forward).toHaveBeenCalledExactlyOnceWith(['/you', 'body-composition', 'new']);
  });

  it('unavailable actions do nothing', async () => {
    const { sheet, forward, choose } = await render(new Date(2026, 9, 8, 12));
    await choose('add-progress-photo');
    expect(forward).not.toHaveBeenCalled();
    expect(sheet.open()).toBe(true);
  });

  describe('Start workout', () => {
    it('resumes the workout in progress without reading the plan or starting anything', async () => {
      const log = finishedLog({ plan: planFor(PROFILE), startedAt: new Date(2026, 9, 8, 8, 0), minutes: 20 });
      const { sheet, forward, byUrl, logs, plans, choose } = await render(THURSDAY, undefined, { active: log });
      await choose('start-workout');
      expect(sheet.open()).toBe(false);
      expect(forward).toHaveBeenCalledExactlyOnceWith(['/workout', 'session', log.source.sessionId, 'active']);
      expect(byUrl).not.toHaveBeenCalled();
      expect(plans.load).not.toHaveBeenCalled();
      expect(logs.start).not.toHaveBeenCalled();
    });

    it('opens today’s planned session in Workout Detail (where Start is confirmed); nothing is started', async () => {
      const { sheet, forward, byUrl, logs, choose } = await render(THURSDAY);
      await choose('start-workout');
      expect(sheet.open()).toBe(false);
      expect(forward).toHaveBeenCalledTimes(1);
      const [path] = forward.mock.calls[0] as unknown as [string[]];
      expect(path.slice(0, 2)).toEqual(['/workout', 'session']);
      expect(path).toHaveLength(3);
      expect(planFor(PROFILE).sessions.map((s) => s.id)).toContain(path[2]);
      expect(byUrl).not.toHaveBeenCalled();
      expect(logs.start).not.toHaveBeenCalled();
    });

    it('on a rest day, or without a profile, opens the Workout tab', async () => {
      const rest = await render(SUNDAY);
      await rest.choose('start-workout');
      expect(rest.sheet.open()).toBe(false);
      expect(rest.byUrl).toHaveBeenCalledExactlyOnceWith('/workout');
      expect(rest.forward).not.toHaveBeenCalled();

      TestBed.resetTestingModule();
      const none = await render(THURSDAY, undefined, { plan: () => Promise.resolve({ kind: 'no-profile' }) });
      await none.choose('start-workout');
      expect(none.byUrl).toHaveBeenCalledExactlyOnceWith('/workout');
      expect(none.forward).not.toHaveBeenCalled();
    });

    it('if the plan can’t be loaded, opens the Workout tab (its retry state) and never another workout', async () => {
      const { sheet, forward, byUrl, logs, choose } = await render(THURSDAY, undefined, {
        plan: () => Promise.reject(new Error('storage')),
      });
      await choose('start-workout');
      expect(sheet.open()).toBe(false);
      expect(byUrl).toHaveBeenCalledExactlyOnceWith('/workout');
      expect(forward).not.toHaveBeenCalled();
      expect(logs.start).not.toHaveBeenCalled();
    });

    it('if navigation doesn’t happen, the sheet reopens', async () => {
      const { sheet, choose } = await render(THURSDAY, () => Promise.resolve(false));
      await choose('start-workout');
      expect(sheet.open()).toBe(true);

      TestBed.resetTestingModule();
      const failing = await render(SUNDAY, () => Promise.reject(new Error('nav')));
      await failing.choose('start-workout');
      expect(failing.sheet.open()).toBe(true);
    });
  });
});
