import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs, NavController } from '@ionic/angular';

import { CLOCK, localIsoDate } from '../../core/time/clock';
import { WorkoutLogService } from '../../core/workout/workout-log.service';
import { WorkoutPlanService } from '../../core/workout/workout-plan.service';
import { WorkoutLog } from '../../domain/workout-session';
import { HomeWorkoutView, toHomeWorkout } from '../../features/home/home-training';
import { NEW_MEASUREMENT_PATH } from '../../features/body-measurements/measurement-paths';
import { NEW_WEIGHT_PATH } from '../../features/body-weight/weight-history-paths';
import { NEW_FOOD_PATH } from '../../features/nutrition/nutrition-paths';
import { WORKOUT_PATH, activeWorkoutPath, workoutSessionPath } from '../../features/workout/workout-paths';
import { toWorkoutScreen } from '../../features/workout/workout-view-model';

import { QuickAddSheetComponent } from '../quick-add/quick-add-sheet.component';
import { QUICK_ADD_ACTIONS, QuickAddAction } from '../quick-add/quick-add.actions';

interface TabDestination {
  kind: 'tab';
  /** Route path under the tabs shell. */
  id: string;
  label: string;
  icon: string;
  /** Filled icon for the active tab, so selection isn't conveyed by color alone. */
  activeIcon: string;
}

interface TabBarAction {
  kind: 'quick-add';
  id: string;
  label: string;
  icon: string;
}

type TabBarItem = TabDestination | TabBarAction;

const TAB_BAR_ITEMS: readonly TabBarItem[] = [
  { kind: 'tab', id: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { kind: 'tab', id: 'workout', label: 'Workout', icon: 'barbell-outline', activeIcon: 'barbell' },
  { kind: 'quick-add', id: 'quick-add', label: 'Quick add', icon: 'add' },
  { kind: 'tab', id: 'nutrition', label: 'Nutrition', icon: 'restaurant-outline', activeIcon: 'restaurant' },
  { kind: 'tab', id: 'you', label: 'You', icon: 'person-circle-outline', activeIcon: 'person-circle' },
];

/**
 * Application shell: bottom tab bar with four routed destinations and a
 * central Quick Add action that opens a sheet instead of navigating.
 */
@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrl: './tabs.page.scss',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, QuickAddSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabsPage {
  protected readonly tabBarItems = TAB_BAR_ITEMS;
  protected readonly activeTab = signal<string | undefined>(undefined);
  protected readonly quickAddOpen = signal(false);
  protected readonly quickAddActions = QUICK_ADD_ACTIONS;

  private readonly nav = inject(NavController);
  private readonly router = inject(Router);
  private readonly clock = inject(CLOCK);
  private readonly plans = inject(WorkoutPlanService);
  private readonly logs = inject(WorkoutLogService);

  /**
   * Handles an available Quick Add action (the sheet has already closed).
   * If navigation doesn't happen, the sheet reopens so the tap isn't lost.
   */
  protected async runQuickAdd(action: QuickAddAction): Promise<void> {
    let navigated = false;
    try {
      switch (action.id) {
        case 'start-workout':
          navigated = await this.startWorkout();
          break;
        case 'add-food':
          // Today (local); the form preselects the meal by time of day.
          navigated = await this.nav.navigateForward(NEW_FOOD_PATH, { queryParams: { date: localIsoDate(this.clock()) } });
          break;
        case 'log-weight':
          navigated = await this.nav.navigateForward(NEW_WEIGHT_PATH);
          break;
        case 'add-measurement':
          navigated = await this.nav.navigateForward(NEW_MEASUREMENT_PATH);
          break;
        default:
          return;
      }
    } catch {
      navigated = false;
    }
    if (!navigated) {
      this.quickAddOpen.set(true);
    }
  }

  /**
   * The same decision as Home's workout card: resume the workout in progress,
   * else open today's session in Workout Detail (where Start and the
   * one-workout-at-a-time conflict are confirmed). Nothing is started here.
   * Rest days, no profile, or a plan that can't be read open the Workout tab.
   * A workout in progress is resumed without reading the plan at all.
   */
  private async startWorkout(): Promise<boolean> {
    let active: WorkoutLog | null;
    let view: HomeWorkoutView | null = null;
    try {
      active = await this.logs.loadActive();
      if (!active) {
        view = toHomeWorkout(toWorkoutScreen(await this.plans.load(), this.clock()), null);
      }
    } catch {
      return this.router.navigateByUrl(WORKOUT_PATH);
    }
    if (active) {
      return this.nav.navigateForward(activeWorkoutPath(active.source.sessionId));
    }
    switch (view?.kind) {
      case 'resistance':
      case 'activity':
        return this.nav.navigateForward(workoutSessionPath(view.sessionId));
      default:
        return this.router.navigateByUrl(WORKOUT_PATH);
    }
  }
}
