import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { STEP_HEADING_ID } from './onboarding-step-form';

@Component({
  selector: 'app-welcome-step',
  template: `
    <div class="mark" aria-hidden="true"><ion-icon name="pulse" /></div>
    <h1 class="title" [id]="headingId" tabindex="-1" data-step-heading>Your fitness journey, built around you.</h1>
    <p class="text">Workouts, nutrition and progress — all in one place.</p>
  `,
  styleUrl: './welcome-step.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WelcomeStepComponent {
  protected readonly headingId = STEP_HEADING_ID;
}
