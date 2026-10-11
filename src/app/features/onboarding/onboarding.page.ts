import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  OnInit,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonFooter, IonHeader, IonIcon, IonToolbar, Platform } from '@ionic/angular';

import { FitnessProfileService } from '../../core/profile/fitness-profile.service';
import { ASSESSMENT_PATH, ONBOARDING_PATH } from '../../core/profile/onboarding.guards';
import { OnboardingMode } from './state/onboarding-flow.service';
import { FitnessButtonComponent, FitnessProgressComponent } from '../../shared/ui';
import { OnboardingFlow } from './state/onboarding-flow.service';
import { BasicsStepComponent } from './steps/basics-step.component';
import { CHOICE_STEPS } from './steps/choice-steps';
import { EquipmentStepComponent } from './steps/equipment-step.component';
import { FinishStepComponent } from './steps/finish-step.component';
import { GoalTargetStepComponent } from './steps/goal-target-step.component';
import { OnboardingStepForm } from './steps/onboarding-step-form';
import { ReportStepComponent } from './steps/report-step.component';
import { SingleChoiceStepComponent } from './steps/single-choice-step.component';
import { SummaryStepComponent } from './steps/summary-step.component';
import { WelcomeStepComponent } from './steps/welcome-step.component';

/** Screens a review may return to when backed out of unchanged (`returnTo`). */
const REVIEW_RETURN_PATHS: readonly string[] = ['/you'];

/**
 * Full-screen onboarding host (no tab bar). Renders the current step and
 * owns the shared chrome: back, progress and the primary action. All flow
 * decisions live in `OnboardingFlow`.
 *
 * Route data `mode: 'review'` (/onboarding/review) opens the summary of the
 * existing profile instead; saving returns to the assessment. Backing out
 * unchanged returns there too, or to an allowed `returnTo` query param.
 */
@Component({
  selector: 'app-onboarding',
  templateUrl: './onboarding.page.html',
  styleUrl: './onboarding.page.scss',
  imports: [
    IonHeader,
    IonToolbar,
    IonContent,
    IonFooter,
    IonIcon,
    FitnessButtonComponent,
    FitnessProgressComponent,
    WelcomeStepComponent,
    SingleChoiceStepComponent,
    BasicsStepComponent,
    EquipmentStepComponent,
    GoalTargetStepComponent,
    ReportStepComponent,
    SummaryStepComponent,
    FinishStepComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.enter)': 'onEnter($event)' },
})
export class OnboardingPage implements OnInit {
  /** Bound from route data. */
  readonly mode = input<OnboardingMode>('new');
  /** Bound from the query string; anything not in `REVIEW_RETURN_PATHS` is ignored. */
  readonly returnTo = input<string>();

  protected readonly flow = inject(OnboardingFlow);
  private readonly profiles = inject(FitnessProfileService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly choiceSteps = CHOICE_STEPS;
  protected readonly saving = computed(() => this.flow.saveStatus() === 'saving');
  /** The current step is working (e.g. reading a report): its primary action waits. */
  protected readonly stepBusy = computed(() => this.stepForm()?.busy?.() ?? false);
  protected readonly reviewing = computed(() => this.flow.mode() === 'review');
  protected readonly primaryLabel = computed(() => {
    if (this.saving()) {
      return this.reviewing() ? 'Saving your details…' : 'Creating your profile…';
    }
    if (this.reviewing() && this.flow.step().kind === 'review') {
      return 'Save my details';
    }
    return this.stepForm()?.primaryLabel?.() ?? this.flow.step().primaryAction;
  });

  private readonly content = viewChild.required(IonContent);
  private readonly stepForm = viewChild(OnboardingStepForm);

  constructor() {
    // On every step change: start at the top and move focus to the new heading
    // so screen-reader and keyboard users land on the new question.
    effect(() => {
      this.flow.stepId();
      if (this.flow.ready()) {
        afterNextRender(() => this.onStepRendered(), { injector: this.injector });
      }
    });

    // Android hardware back steps back through onboarding before leaving it.
    const backButton = inject(Platform).backButton.subscribeWithPriority(10, (processNextHandler) => {
      if (this.flow.canGoBack()) {
        void this.back();
      } else {
        processNextHandler();
      }
    });
    inject(DestroyRef).onDestroy(() => backButton.unsubscribe());
  }

  ngOnInit(): void {
    void this.start();
  }

  protected async back(): Promise<void> {
    // Backing out of a review (from its summary) returns unchanged to where it was opened.
    if (this.flow.mode() === 'review' && this.flow.stepId() === 'summary' && !this.flow.editingFromSummary()) {
      const returnTo = this.returnTo();
      const target = returnTo && REVIEW_RETURN_PATHS.includes(returnTo) ? returnTo : ASSESSMENT_PATH;
      await this.router.navigateByUrl(target, { replaceUrl: true });
      return;
    }
    this.flow.back();
  }

  protected async primaryAction(): Promise<void> {
    switch (this.flow.step().kind) {
      case 'done':
        await this.router.navigateByUrl(ASSESSMENT_PATH, { replaceUrl: true });
        return;
      case 'review':
        if ((await this.flow.complete()) && this.flow.mode() === 'review') {
          await this.router.navigateByUrl(ASSESSMENT_PATH, { replaceUrl: true });
        }
        return;
      default:
        if (this.stepForm()?.submit() ?? true) {
          this.flow.next();
        }
    }
  }

  /** Enter in a text field acts like Continue. */
  protected onEnter(event: Event): void {
    if (event.target instanceof HTMLInputElement && event.target.type === 'text') {
      event.preventDefault();
      void this.primaryAction();
    }
  }

  private async start(): Promise<void> {
    if (this.mode() !== 'review') {
      await this.flow.restore();
      return;
    }
    const profile = await this.profiles.load();
    if (profile) {
      this.flow.startReview(profile);
    } else {
      await this.router.navigateByUrl(ONBOARDING_PATH, { replaceUrl: true });
    }
  }

  private onStepRendered(): void {
    void this.content().scrollToTop(0);
    this.host.nativeElement.querySelector<HTMLElement>('[data-step-heading]')?.focus({ preventScroll: true });
  }
}
