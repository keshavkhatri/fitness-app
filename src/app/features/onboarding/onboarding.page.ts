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
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonFooter, IonHeader, IonIcon, IonToolbar, Platform } from '@ionic/angular';

import { HOME_PATH } from '../../core/profile/onboarding.guards';
import { FitnessButtonComponent, FitnessProgressComponent } from '../../shared/ui';
import { OnboardingFlow } from './state/onboarding-flow.service';
import { BasicsStepComponent } from './steps/basics-step.component';
import { CHOICE_STEPS } from './steps/choice-steps';
import { EquipmentStepComponent } from './steps/equipment-step.component';
import { FinishStepComponent } from './steps/finish-step.component';
import { GoalTargetStepComponent } from './steps/goal-target-step.component';
import { OnboardingStepForm } from './steps/onboarding-step-form';
import { SingleChoiceStepComponent } from './steps/single-choice-step.component';
import { SummaryStepComponent } from './steps/summary-step.component';
import { WelcomeStepComponent } from './steps/welcome-step.component';

/**
 * Full-screen onboarding host (no tab bar). Renders the current step and
 * owns the shared chrome: back, progress and the primary action. All flow
 * decisions live in `OnboardingFlow`.
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
    SummaryStepComponent,
    FinishStepComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.enter)': 'onEnter($event)' },
})
export class OnboardingPage {
  protected readonly flow = inject(OnboardingFlow);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly choiceSteps = CHOICE_STEPS;
  protected readonly saving = computed(() => this.flow.saveStatus() === 'saving');

  private readonly content = viewChild.required(IonContent);
  private readonly stepForm = viewChild(OnboardingStepForm);

  constructor() {
    void this.flow.restore();

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
        this.flow.back();
      } else {
        processNextHandler();
      }
    });
    inject(DestroyRef).onDestroy(() => backButton.unsubscribe());
  }

  protected async primaryAction(): Promise<void> {
    switch (this.flow.step().kind) {
      case 'done':
        await this.router.navigateByUrl(HOME_PATH, { replaceUrl: true });
        return;
      case 'review':
        await this.flow.complete();
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

  private onStepRendered(): void {
    void this.content().scrollToTop(0);
    this.host.nativeElement.querySelector<HTMLElement>('[data-step-heading]')?.focus({ preventScroll: true });
  }
}
