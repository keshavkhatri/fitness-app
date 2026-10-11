import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, NavController } from '@ionic/angular';

import { BodyCompositionHistoryService } from '../../core/body-composition/body-composition-history.service';
import { EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent } from '../../shared/ui';
import { NEW_WEIGHT_PATH } from '../body-weight/weight-history-paths';
import { BODY_COMPOSITION_COPY } from './body-composition-content';
import { toBodyCompositionDetailScreen } from './body-composition-detail-view-model';
import { BODY_COMPOSITION_HISTORY_PATH } from './body-composition-paths';

/**
 * One saved assessment: `/you/body-composition/:assessmentId`. Read-only:
 * every recorded value and its difference from the previous assessment.
 * Nothing here changes the profile or weight history; updating the profile
 * weight stays the explicit "Use as profile weight" action on a weigh-in.
 */
@Component({
  selector: 'app-body-composition-detail',
  templateUrl: './body-composition-detail.page.html',
  styleUrl: './body-composition-history.page.scss',
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonIcon,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BodyCompositionDetailPage {
  private readonly history = inject(BodyCompositionHistoryService);
  private readonly nav = inject(NavController);

  /** Route parameter (component input binding). */
  readonly assessmentId = input.required<string>();

  protected readonly copy = BODY_COMPOSITION_COPY.detail;
  protected readonly errorCopy = BODY_COMPOSITION_COPY.history.error;
  protected readonly returnPath = BODY_COMPOSITION_HISTORY_PATH;
  protected readonly screen = computed(() => toBodyCompositionDetailScreen(this.history.state(), this.assessmentId(), this.history.today()));

  constructor() {
    if (this.history.state().status !== 'ready') {
      void this.history.load();
    }
  }

  protected retry(): void {
    void this.history.load();
  }

  protected logWeight(): void {
    void this.nav.navigateForward(NEW_WEIGHT_PATH);
  }

  protected back(): void {
    void this.nav.navigateBack(BODY_COMPOSITION_HISTORY_PATH);
  }
}
