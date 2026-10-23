import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonFooter, IonHeader, IonIcon, IonToolbar } from '@ionic/angular';

import { HOME_PATH, ONBOARDING_REVIEW_PATH } from '../../core/profile/onboarding.guards';
import { OnboardingStatusService } from '../../core/profile/onboarding-status.service';
import { ThemeService } from '../../core/theme/theme.service';
import { FitnessButtonComponent, LoadingSkeletonComponent, NoticeComponent } from '../../shared/ui';
import { ASSESSMENT_COPY } from './assessment-content';
import { AssessmentService } from './assessment.service';
import { ResultsViewComponent } from './views/results-view.component';

type FooterAction = 'home' | 'review' | 'continue-anyway' | 'retry';

/**
 * The assessment: the user's starting estimates and targets, shown after
 * onboarding (and whenever the profile changes), on one screen: calorie target,
 * macros, goal, what it is based on and (folded away) how it was worked out.
 * All calculation lives in the domain engine; the view only renders its view model.
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
    IonIcon,
    FitnessButtonComponent,
    LoadingSkeletonComponent,
    NoticeComponent,
    ResultsViewComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'fit-theme-immersive' },
})
export class AssessmentPage {
  private readonly service = inject(AssessmentService);
  private readonly status = inject(OnboardingStatusService);
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);

  protected readonly copy = ASSESSMENT_COPY;
  protected readonly screen = resource({ loader: () => this.service.load() });
  protected readonly result = computed(() => {
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
      return ['home'];
    }
    const result = this.result();
    if (!result) {
      return ['review'];
    }
    return result.requiresReview ? ['review', 'continue-anyway'] : ['home', 'review'];
  });

  protected readonly actionLabels: Record<FooterAction, string> = {
    home: ASSESSMENT_COPY.actions.goHome,
    review: ASSESSMENT_COPY.actions.review,
    'continue-anyway': ASSESSMENT_COPY.actions.continueAnyway,
    retry: ASSESSMENT_COPY.actions.retry,
  };

  constructor() {
    // Light status-bar text: the screen is dark.
    const release = this.theme.holdAlwaysDark();
    inject(DestroyRef).onDestroy(release);
  }

  protected async run(action: FooterAction): Promise<void> {
    switch (action) {
      case 'retry':
        this.screen.reload();
        return;
      case 'review':
        // The Profile editor; saving there brings the user back to a fresh assessment.
        await this.router.navigateByUrl(ONBOARDING_REVIEW_PATH);
        return;
      default:
        await this.leaveTo(HOME_PATH);
    }
  }

  /** Into the app: the assessment counts as reviewed (the tab shell requires it). */
  private async leaveTo(path: string): Promise<void> {
    const screen = this.screen.hasValue() ? this.screen.value() : null;
    if (screen?.kind !== 'ready' || this.navigating()) {
      return;
    }
    this.navigating.set(true);
    try {
      await this.status.markAssessmentReviewed(screen.profile);
      await this.router.navigateByUrl(path, { replaceUrl: true });
    } finally {
      this.navigating.set(false);
    }
  }
}
