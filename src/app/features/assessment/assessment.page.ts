import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonFooter, IonHeader, IonIcon, IonToolbar, Platform } from '@ionic/angular';

import { ASSESSMENT_PATH, HOME_PATH, ONBOARDING_REVIEW_PATH } from '../../core/profile/onboarding.guards';
import { OnboardingStatusService } from '../../core/profile/onboarding-status.service';
import { ThemeService } from '../../core/theme/theme.service';
import { FitnessButtonComponent, LoadingSkeletonComponent, NoticeComponent } from '../../shared/ui';
import { NUTRITION_PATH } from '../nutrition/nutrition-paths';
import { WORKOUT_PATH } from '../workout/workout-paths';
import { ASSESSMENT_COPY } from './assessment-content';
import { AssessmentService } from './assessment.service';
import { MacroBreakdownViewComponent } from './views/macro-breakdown-view.component';
import { NextStepId, NextStepsViewComponent } from './views/next-steps-view.component';
import { ResultsViewComponent } from './views/results-view.component';
import { WhyViewComponent } from './views/why-view.component';

/** The four views, in order. Results needs no query parameter. */
export const ASSESSMENT_VIEWS = ['results', 'macros', 'why', 'next'] as const;
export type AssessmentView = (typeof ASSESSMENT_VIEWS)[number];
const isView = (value: unknown): value is AssessmentView => (ASSESSMENT_VIEWS as readonly unknown[]).includes(value);
/** Results and Why are dark (immersive); Macros and Next steps are warm light. */
const DARK_VIEWS: ReadonlySet<AssessmentView> = new Set(['results', 'why']);

const PROGRESS_PATH = '/progress';
const NEXT_STEP_PATHS: Readonly<Record<Exclude<NextStepId, 'adjust'>, string>> = {
  workout: WORKOUT_PATH,
  nutrition: NUTRITION_PATH,
  progress: PROGRESS_PATH,
};

type FooterAction = 'macros' | 'why' | 'next' | 'home' | 'again' | 'review' | 'continue-anyway' | 'retry';

export const viewUrl = (view: AssessmentView) => (view === 'results' ? ASSESSMENT_PATH : `${ASSESSMENT_PATH}?view=${view}`);

/**
 * The assessment: the user's starting estimates and targets, shown after
 * onboarding (and whenever the profile changes), as four views of one
 * result: Results → Macro breakdown → Why these numbers? → Next steps.
 *
 * One route: the view is the `view` query parameter, so the page (and the
 * loaded result) stays put while browser history, Back and Android back move
 * between views. All calculation lives in the domain engine; the views only
 * render its view model.
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
    MacroBreakdownViewComponent,
    WhyViewComponent,
    NextStepsViewComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.fit-theme-immersive]': 'dark()',
    '[class.fit-theme-dashboard]': '!dark()',
  },
})
export class AssessmentPage {
  /** Query parameter (`?view=macros`); anything unknown shows the results. */
  readonly view = input<string>();

  private readonly service = inject(AssessmentService);
  private readonly status = inject(OnboardingStatusService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly theme = inject(ThemeService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly copy = ASSESSMENT_COPY;
  protected readonly screen = resource({ loader: () => this.service.load() });
  protected readonly result = computed(() => {
    const screen = this.screen.hasValue() ? this.screen.value() : null;
    return screen?.kind === 'ready' ? screen.view : null;
  });
  /** Only a loaded result has the later views; everything else is shown as Results. */
  protected readonly current = computed<AssessmentView>(() => {
    const view = this.view();
    return this.result() && isView(view) ? view : 'results';
  });
  protected readonly dark = computed(() => DARK_VIEWS.has(this.current()));
  protected readonly navigating = signal(false);

  /** Primary action first. Review states never offer Continue as the primary action. */
  protected readonly actions = computed<readonly FooterAction[]>(() => {
    if (this.screen.error()) {
      return ['retry'];
    }
    if (this.screen.isLoading() || !this.screen.hasValue()) {
      return ['macros'];
    }
    const result = this.result();
    if (!result) {
      return ['review'];
    }
    switch (this.current()) {
      case 'results':
        return result.requiresReview ? ['review', 'continue-anyway'] : ['macros'];
      case 'macros':
        return ['why'];
      case 'why':
        return ['next'];
      case 'next':
        return ['home', 'again'];
    }
  });

  protected readonly actionLabels: Record<FooterAction, string> = {
    macros: ASSESSMENT_COPY.actions.viewMacros,
    why: ASSESSMENT_COPY.actions.viewWhy,
    next: ASSESSMENT_COPY.actions.viewNext,
    home: ASSESSMENT_COPY.actions.goHome,
    again: ASSESSMENT_COPY.actions.viewAgain,
    review: ASSESSMENT_COPY.actions.review,
    'continue-anyway': ASSESSMENT_COPY.actions.continueAnyway,
    retry: ASSESSMENT_COPY.actions.retry,
  };

  private readonly content = viewChild(IonContent);
  /** Views this page pushed onto browser history (Back pops those rather than adding entries). */
  private pushed = 0;

  constructor() {
    // Light status-bar text while a dark view shows.
    let release: (() => void) | null = null;
    effect(() => {
      const dark = this.dark();
      if (dark && !release) {
        release = this.theme.holdAlwaysDark();
      } else if (!dark && release) {
        release();
        release = null;
      }
    });
    inject(DestroyRef).onDestroy(() => release?.());

    // Each view starts at the top, with focus on its heading.
    effect(() => {
      this.current();
      afterNextRender(
        () => {
          void this.content()?.scrollToTop(0);
          this.host.nativeElement.querySelector<HTMLElement>('[data-view-heading]')?.focus({ preventScroll: true });
        },
        { injector: this.injector },
      );
    });

    // Android back steps back through the views before leaving the page.
    const backButton = inject(Platform).backButton.subscribeWithPriority(10, (processNextHandler) => {
      if (this.current() !== 'results') {
        void this.back();
      } else {
        processNextHandler();
      }
    });
    inject(DestroyRef).onDestroy(() => backButton.unsubscribe());
  }

  /** The previous view: back through history this page added, else straight to it. */
  protected async back(): Promise<void> {
    const index = ASSESSMENT_VIEWS.indexOf(this.current());
    if (index <= 0) {
      return;
    }
    if (this.pushed > 0) {
      this.pushed--;
      this.location.back();
      return;
    }
    await this.router.navigateByUrl(viewUrl(ASSESSMENT_VIEWS[index - 1]), { replaceUrl: true });
  }

  protected async run(action: FooterAction): Promise<void> {
    switch (action) {
      case 'retry':
        this.screen.reload();
        return;
      case 'review':
        await this.router.navigateByUrl(ONBOARDING_REVIEW_PATH);
        return;
      case 'macros':
      case 'why':
      case 'next':
        await this.show(action);
        return;
      case 'again':
        // Back to the start: the views just seen are dropped from history rather than kept twice.
        this.pushed = 0;
        await this.router.navigateByUrl(viewUrl('results'), { replaceUrl: true });
        return;
      default:
        await this.leaveTo(HOME_PATH);
    }
  }

  protected async openNextStep(step: NextStepId): Promise<void> {
    if (step === 'adjust') {
      // The Profile editor; saving there brings the user back to a fresh assessment.
      await this.router.navigateByUrl(ONBOARDING_REVIEW_PATH);
      return;
    }
    await this.leaveTo(NEXT_STEP_PATHS[step]);
  }

  private async show(view: AssessmentView): Promise<void> {
    if (await this.router.navigateByUrl(viewUrl(view))) {
      this.pushed++;
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
