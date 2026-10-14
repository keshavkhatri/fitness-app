import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { UserIdentityService } from '../../../core/identity/user-identity.service';
import { FitnessAvatarComponent } from '../../../shared/ui';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { STEP_HEADING_ID } from './onboarding-step-form';
import { buildSummaryRows, groupSummaryRows } from './summary-rows';

/**
 * Review answers, grouped; each row is a button that opens the step that
 * edits it (with its own validation). The page's primary action then
 * creates the profile. In review mode this is the Profile editor: the same
 * rows under a profile header, and Save profile saves through the flow.
 */
@Component({
  selector: 'app-summary-step',
  template: `
    @if (flow.mode() === 'review') {
      <header class="profile-header">
        <h1 class="profile-title" [id]="headingId" tabindex="-1" data-step-heading>Profile</h1>
        @let me = identity.identity();
        <fit-avatar [name]="me.name ?? flow.draft().name" [photo]="me.photo" [size]="80" />
        <p class="helper">Edit anything that has changed, then save.</p>
      </header>
    } @else {
      <header class="header">
        <h1 class="title" [id]="headingId" tabindex="-1" data-step-heading>Review your details</h1>
        <p class="helper">Check your answers. Tap any of them to change it before creating your profile.</p>
      </header>
    }

    @if (flow.saveStatus() === 'error') {
      <div class="save-error" role="alert">
        <ion-icon name="alert-circle-outline" aria-hidden="true" />
        <p>We couldn't save your profile. Check your device storage and try again.</p>
      </div>
    }

    @for (group of groups(); track group.id) {
      <section class="group" [attr.aria-labelledby]="'profile-' + group.id" [attr.data-testid]="'profile-group-' + group.id">
        <h2 class="group-title" [id]="'profile-' + group.id">{{ group.title }}</h2>
        <ul class="fields">
          @for (row of group.rows; track row.id) {
            <li>
              <button
                type="button"
                class="field"
                [attr.aria-label]="'Edit ' + row.label.toLowerCase() + ': ' + row.value"
                [disabled]="flow.saveStatus() === 'saving'"
                [attr.data-testid]="'profile-row-' + row.id"
                (click)="flow.edit(row.editStep)"
              >
                @if (row.icon) {
                  <ion-icon class="field-icon" [name]="row.icon" aria-hidden="true" />
                }
                <span class="field-label">{{ row.label }}</span>&ngsp;
                <span class="field-value">{{ row.value }}</span>
                <ion-icon class="field-chevron" name="chevron-forward" aria-hidden="true" />
              </button>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styleUrl: './summary-step.component.scss',
  imports: [IonIcon, FitnessAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SummaryStepComponent {
  protected readonly flow = inject(OnboardingFlow);
  protected readonly headingId = STEP_HEADING_ID;
  protected readonly identity = inject(UserIdentityService);
  protected readonly rows = computed(() => buildSummaryRows(this.flow.draft()));
  /** Review mode (the Profile editor): the same rows, grouped. */
  protected readonly groups = computed(() => groupSummaryRows(this.rows()));
}
