import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IonIcon, NavController } from '@ionic/angular';

import { ThemePreference, ThemeService } from '../../core/theme/theme.service';
import { WEIGHT_HISTORY_PATH } from '../body-weight/weight-history-paths';
import {
  FitnessCardComponent,
  FitnessChipComponent,
  PageLayoutComponent,
  SectionHeaderComponent,
  SegmentOption,
  SegmentedControlComponent,
} from '../../shared/ui';

const THEME_OPTIONS: readonly SegmentOption<ThemePreference>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Settings that exist in the product plan but are not built yet. */
const UPCOMING_SETTINGS: readonly string[] = ['Units', 'Notifications', 'Connected health apps', 'Subscription'];

/** Profile and settings shell. */
@Component({
  selector: 'app-you',
  templateUrl: './you.page.html',
  styleUrl: './you.page.scss',
  imports: [
    IonIcon,
    FitnessCardComponent,
    FitnessChipComponent,
    PageLayoutComponent,
    SectionHeaderComponent,
    SegmentedControlComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YouPage {
  protected readonly theme = inject(ThemeService);
  protected readonly themeOptions = THEME_OPTIONS;
  protected readonly upcomingSettings = UPCOMING_SETTINGS;

  private readonly nav = inject(NavController);

  protected openProgress(): void {
    void this.nav.navigateForward(['/you', 'progress']);
  }

  protected openWeightHistory(): void {
    void this.nav.navigateForward(WEIGHT_HISTORY_PATH);
  }
}
