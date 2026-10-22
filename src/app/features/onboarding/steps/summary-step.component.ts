import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { UserIdentityService } from '../../../core/identity/user-identity.service';
import { FitnessAvatarComponent } from '../../../shared/ui';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { ReportImport } from '../state/report-import.service';
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

    @if (flow.mode() === 'new' && reportSummary(); as r) {
      <section class="group report" aria-labelledby="profile-report" data-testid="report-keep">
        <h2 class="group-title" id="profile-report">From your InBody report</h2>
        <p class="helper">{{ r.text }}</p>
        <label class="check">
          <input type="checkbox" data-testid="report-keep-results" [checked]="report!.keepResults()" (change)="report!.keepResults.set(!report!.keepResults())" />
          <span>Save the report to my body composition</span>
        </label>
        @if (r.weights > 0) {
          <label class="check">
            <input
              type="checkbox"
              data-testid="report-log-weights"
              [checked]="report!.logWeights()"
              [disabled]="!report!.keepResults()"
              (change)="report!.logWeights.set(!report!.logWeights())"
            />
            <span>Also add {{ r.weights === 1 ? 'its weight' : 'the ' + r.weights + ' weights' }} to my weight history</span>
          </label>
        }
        <p class="helper small">You can check or change every value later in You › Body composition.</p>
      </section>
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
  protected readonly report = inject(ReportImport, { optional: true });
  /** What keeping the report would save: "36 values from Oct 1 and 6 earlier tests …". */
  protected readonly reportSummary = computed(() => {
    const prefill = this.report?.reading()?.prefill;
    if (!prefill) {
      return null;
    }
    const values = Object.values(prefill.assessment.values).filter((p) => p.kind === 'prefilled').length;
    const earlier = prefill.history.length;
    const weights = (prefill.assessment.values.weight?.kind === 'prefilled' ? 1 : 0) + prefill.history.filter((h) => h.values.weight).length;
    const tests = earlier === 0 ? '' : ` and ${earlier === 1 ? '1 earlier test' : `${earlier} earlier tests`} from its history chart`;
    return { text: `${values} ${values === 1 ? 'value' : 'values'} from this test${tests} will be saved as body composition.`, weights };
  });
  protected readonly rows = computed(() => buildSummaryRows(this.flow.draft()));
  /** Review mode (the Profile editor): the same rows, grouped. */
  protected readonly groups = computed(() => groupSummaryRows(this.rows()));
}
