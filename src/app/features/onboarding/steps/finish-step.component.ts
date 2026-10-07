import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { STEP_HEADING_ID } from './onboarding-step-form';

@Component({
  selector: 'app-finish-step',
  template: `
    <div class="mark" aria-hidden="true"><ion-icon name="checkmark" /></div>
    <h1 class="title" [id]="headingId" tabindex="-1" data-step-heading>You're all set</h1>
    <p class="text">Your fitness profile has been created.</p>
  `,
  styleUrl: './finish-step.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinishStepComponent {
  protected readonly headingId = STEP_HEADING_ID;
}
