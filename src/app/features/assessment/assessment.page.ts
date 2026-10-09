import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonFooter, IonHeader, IonToolbar } from '@ionic/angular';

import { HOME_PATH, ONBOARDING_REVIEW_PATH } from '../../core/profile/onboarding.guards';
import { OnboardingStatusService } from '../../core/profile/onboarding-status.service';
import { FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent, NoticeComponent } from '../../shared/ui';
import { ASSESSMENT_COPY } from './assessment-content';
import { AssessmentService } from './assessment.service';
import { EnergySummaryComponent } from './components/energy-summary.component';
import { GoalSummaryComponent } from './components/goal-summary.component';
import { MacroSummaryComponent } from './components/macro-summary.component';

type FooterAction = 'continue' | 'review' | 'continue-anyway' | 'retry';

/**
 * "Your starting point": the user's initial estimates and planning targets,
 * shown once after onboarding (and whenever the profile changes).
 * Renders a view model; all calculation lives in the domain engine.
 */
@Component({
  selector: 'app-assessment',
  templateUrl: './assessment.page.html',
  styleUrl: './assessment.page.scss',
  imports: [
    IonHeader,
    IonToolbar,
    IonContent,
    IonFooter,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    NoticeComponent,
    GoalSummaryComponent,
    EnergySummaryComponent,
    MacroSummaryComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssessmentPage {
  private readonly service = inject(AssessmentService);
  private readonly status = inject(OnboardingStatusService);
  private readonly router = inject(Router);

  protected readonly copy = ASSESSMENT_COPY;
  protected readonly screen = resource({ loader: () => this.service.load() });
  protected readonly view = computed(() => {
    const screen = this.screen.hasValue() ? this.screen.value() : null;
    return screen?.kind === 'ready' ? screen.view : null;
  });
  protected readonly navigating = signal(false);

  /** Primary action first. Review states never offer Continue as the primary action. */
  protected readonly actions = computed<readonly FooterAction[]>(() => {
    if (this.screen.error()) {
      return ['retry'];
    }
    if (this.screen.isLoading() || !this.screen.hasValue()) {
      return ['continue'];
    }
    const view = this.view();
    if (!view) {
      return ['review'];
    }
    return view.requiresReview ? ['review', 'continue-anyway'] : ['continue'];
  });

  protected readonly actionLabels: Record<FooterAction, string> = {
    continue: ASSESSMENT_COPY.actions.continue,
    review: ASSESSMENT_COPY.actions.review,
    'continue-anyway': ASSESSMENT_COPY.actions.continueAnyway,
    retry: ASSESSMENT_COPY.actions.retry,
  };

  protected async run(action: FooterAction): Promise<void> {
    switch (action) {
      case 'retry':
        this.screen.reload();
        return;
      case 'review':
        await this.router.navigateByUrl(ONBOARDING_REVIEW_PATH);
        return;
      default:
        await this.continueToHome();
    }
  }

  private async continueToHome(): Promise<void> {
    const screen = this.screen.hasValue() ? this.screen.value() : null;
    if (screen?.kind !== 'ready' || this.navigating()) {
      return;
    }
    this.navigating.set(true);
    try {
      await this.status.markAssessmentReviewed(screen.profile);
      await this.router.navigateByUrl(HOME_PATH, { replaceUrl: true });
    } finally {
      this.navigating.set(false);
    }
  }
}
