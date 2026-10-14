import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { UserIdentityService } from '../../../core/identity/user-identity.service';
import { FitnessAvatarComponent, FitnessCardComponent } from '../../../shared/ui';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { STEP_HEADING_ID } from './onboarding-step-form';
import { buildSummaryRows, groupSummaryRows } from './summary-rows';

/**
 * Review answers, edit any section, then create the profile (via the page's
 * primary action). In review mode this is the Profile editor: the same rows,
 * grouped as field-like buttons; each opens the step that edits it (with its
 * own validation) and Save profile saves through the flow as before.
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
                  <span class="field-label">{{ row.label }}</span>&ngsp;
                  <span class="field-value">{{ row.value }}</span>
                  <ion-icon class="field-chevron" name="chevron-forward" aria-hidden="true" />
                </button>
              </li>
            }
          </ul>
        </section>
      }
    } @else {
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
  }
  `,
  styleUrl: './summary-step.component.scss',
  imports: [IonIcon, FitnessAvatarComponent, FitnessCardComponent],
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
