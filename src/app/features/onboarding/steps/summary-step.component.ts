import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent } from '../../../shared/ui';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { STEP_HEADING_ID } from './onboarding-step-form';
import { buildSummaryRows } from './summary-rows';

/** Review answers, edit any section, then create the profile (via the page's primary action). */
@Component({
  selector: 'app-summary-step',
  template: `
    <header class="header">
      <p class="eyebrow">Your fitness profile</p>
      <h1 class="title" [id]="headingId" tabindex="-1" data-step-heading>Does this look right?</h1>
      <p class="helper">
        @if (flow.mode() === 'review') {
          Review your answers. Edit anything that has changed, then save.
        } @else {
          Review your answers. You can edit anything before creating your profile.
        }
      </p>
    </header>

    @if (flow.saveStatus() === 'error') {
      <div class="save-error" role="alert">
        <ion-icon name="alert-circle-outline" aria-hidden="true" />
        <p>We couldn't save your profile. Check your device storage and try again.</p>
      </div>
    }

    <fit-card padding="none">
      <ul class="rows">
        @for (row of rows(); track row.id) {
          <li class="row">
            <span class="label">{{ row.label }}</span>
            <span class="value">{{ row.value }}</span>
            <button
              type="button"
              class="edit"
              [attr.aria-label]="'Edit ' + row.label.toLowerCase()"
              [disabled]="flow.saveStatus() === 'saving'"
              (click)="flow.edit(row.editStep)"
            >
              Edit
            </button>
          </li>
        }
      </ul>
    </fit-card>
  `,
  styleUrl: './summary-step.component.scss',
  imports: [IonIcon, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SummaryStepComponent {
  protected readonly flow = inject(OnboardingFlow);
  protected readonly headingId = STEP_HEADING_ID;
  protected readonly rows = computed(() => buildSummaryRows(this.flow.draft()));
}
