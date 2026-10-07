import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';

import { QuickAddSheetComponent } from '../quick-add/quick-add-sheet.component';
import { QUICK_ADD_ACTIONS } from '../quick-add/quick-add.actions';

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
}
