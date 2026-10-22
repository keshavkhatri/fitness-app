import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs, NavController } from '@ionic/angular';

import { CLOCK, localIsoDate } from '../../core/time/clock';
import { WorkoutLogService } from '../../core/workout/workout-log.service';
import { WorkoutPlanService } from '../../core/workout/workout-plan.service';
import { WorkoutLog } from '../../domain/workout-session';
import { HomeWorkoutView, toHomeWorkout } from '../../features/home/home-training';
import { NEW_BODY_COMPOSITION_PATH } from '../../features/body-composition/body-composition-paths';
import { NEW_MEASUREMENT_PATH } from '../../features/body-measurements/measurement-paths';
import { NEW_WEIGHT_PATH } from '../../features/body-weight/weight-history-paths';
import { NEW_FOOD_PATH } from '../../features/nutrition/nutrition-paths';
import { WORKOUT_PATH, activeWorkoutPath, workoutSessionPath } from '../../features/workout/workout-paths';
import { toWorkoutScreen } from '../../features/workout/workout-view-model';

import { QuickAddLauncher } from '../quick-add/quick-add-launcher.service';
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

/** Labels follow the redesign (Train, Fuel); the route ids are unchanged. */
const TAB_BAR_ITEMS: readonly TabDestination[] = [
  { kind: 'tab', id: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { kind: 'tab', id: 'workout', label: 'Train', icon: 'barbell-outline', activeIcon: 'barbell' },
  { kind: 'tab', id: 'nutrition', label: 'Fuel', icon: 'nutrition-outline', activeIcon: 'nutrition' },
  { kind: 'tab', id: 'progress', label: 'Progress', icon: 'stats-chart-outline', activeIcon: 'stats-chart' },
  { kind: 'tab', id: 'you', label: 'You', icon: 'person-outline', activeIcon: 'person' },
];

/**
 * Application shell: bottom tab bar with five routed destinations, and the
 * Quick Add sheet, opened from the You tab through `QuickAddLauncher`.
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
  /** Two-way bound to the sheet: pages open it via `QuickAddLauncher`. */
  protected readonly quickAddOpen = inject(QuickAddLauncher).open;
  protected readonly quickAddActions = QUICK_ADD_ACTIONS;

  private readonly nav = inject(NavController);
  private readonly router = inject(Router);
  private readonly clock = inject(CLOCK);
  private readonly plans = inject(WorkoutPlanService);
  private readonly logs = inject(WorkoutLogService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * A tab became active. Switching tabs (not the first one shown) fades the tab's content up into place
   * (docs/motion-plan.md #2). Played here, on the tab change only: pages opened or returned to inside a tab
   * have their own page transition, and a second fade there showed as a blink.
   */
  protected tabChanged(tab: string): void {
    const switched = this.activeTab() !== undefined && this.activeTab() !== tab;
    this.activeTab.set(tab);
    if (switched && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      requestAnimationFrame(() => this.fadeInActivePage());
    }
  }

  private fadeInActivePage(): void {
    const pages = this.host.nativeElement.querySelectorAll<HTMLElement>('ion-tabs ion-router-outlet > .ion-page:not(.ion-page-hidden)');
    const page = pages[pages.length - 1];
    // The page's own blocks, never ion-content (a transform there would break its fixed children).
    const blocks = page?.querySelectorAll<HTMLElement>(':scope > fit-page > ion-content > :is(.custom-header, .large-title-block, .page-body)');
    blocks?.forEach((block) =>
      block.animate?.(
        [
          { opacity: 0.4, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 260, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
      ),
    );
  }

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
        case 'upload-inbody':
          navigated = await this.nav.navigateForward(NEW_BODY_COMPOSITION_PATH);
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
