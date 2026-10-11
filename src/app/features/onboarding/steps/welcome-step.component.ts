import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { ChoiceGroupComponent } from '../../../shared/ui';
import { SETUP_METHOD_OPTIONS } from '../onboarding-content';
import { SetupMethod } from '../state/onboarding-draft';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { ReportImport } from '../state/report-import.service';
import { STEP_HEADING_ID } from './onboarding-step-form';

/**
 * Intro, and the choice of how to set up: manually (the default, so "Get
 * Started" works as it always has) or from an InBody report, offered only
 * when this build can read reports.
 */
@Component({
  selector: 'app-welcome-step',
  template: `
    <div class="mark" aria-hidden="true"><ion-icon name="pulse" /></div>
    <h1 class="title" [id]="headingId" tabindex="-1" data-step-heading>Your fitness journey, built around you.</h1>
    <p class="text">Workouts, nutrition and progress — all in one place.</p>

    @if (reportUploadAvailable) {
      <div class="setup">
        <h2 class="setup-label" id="setup-method-label">How would you like to set up?</h2>
        <fit-choice-group
          name="setup-method"
          labelledBy="setup-method-label"
          [options]="setupOptions"
          [selected]="selected()"
          (optionToggled)="choose($event)"
        />
      </div>
    }
  `,
  styleUrl: './welcome-step.component.scss',
  imports: [IonIcon, ChoiceGroupComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WelcomeStepComponent {
  private readonly flow = inject(OnboardingFlow);

  protected readonly headingId = STEP_HEADING_ID;
  protected readonly setupOptions = SETUP_METHOD_OPTIONS;
  protected readonly reportUploadAvailable = inject(ReportImport, { optional: true })?.available ?? false;
  protected readonly selected = computed(() => [this.flow.draft().setupMethod]);

  protected choose(setupMethod: SetupMethod): void {
    this.flow.update({ setupMethod });
  }
}
