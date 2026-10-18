import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { APP_BRAND } from '../../../core/brand';
import { WELCOME_PHOTO } from '../onboarding-media';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { ReportImport } from '../state/report-import.service';
import { OnboardingStepForm, STEP_HEADING_ID } from './onboarding-step-form';

/** What the app does, each backed by a real feature. */
const BENEFITS = [
  { icon: 'barbell', text: 'A workout plan built for you' },
  { icon: 'nutrition', text: 'Track your nutrition' },
  { icon: 'stats-chart', text: 'See your progress' },
  { icon: 'flash', text: 'Build lasting habits' },
] as const;

/**
 * Intro on a dark backdrop (a photo once one ships; see onboarding-media).
 * "Get started" sets up by answering questions; when this build can read
 * InBody reports, a second action sets up from one instead.
 */
@Component({
  selector: 'app-welcome-step',
  template: `
    <div class="backdrop" aria-hidden="true">
      @if (photo) {
        <img [src]="photo" alt="" />
      } @else {
        <ion-icon class="placeholder" name="barbell" />
      }
    </div>

    <div class="content">
      <h1 class="title" [id]="headingId" tabindex="-1" data-step-heading>
        Welcome to <span class="brand">{{ brand }}</span>
      </h1>
      <p class="text">Answer a few questions and get a workout plan and calorie target built for you.</p>

      <ul class="benefits">
        @for (benefit of benefits; track benefit.text) {
          <li><ion-icon [name]="benefit.icon" aria-hidden="true" />{{ benefit.text }}</li>
        }
      </ul>

      @if (reportUploadAvailable) {
        <button type="button" class="report" (click)="setUpFromReport()">
          <ion-icon name="document-text-outline" aria-hidden="true" />
          Set up from an InBody report instead
        </button>
      }
    </div>
  `,
  styleUrl: './welcome-step.component.scss',
  imports: [IonIcon],
  providers: [{ provide: OnboardingStepForm, useExisting: WelcomeStepComponent }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WelcomeStepComponent implements OnboardingStepForm {
  private readonly flow = inject(OnboardingFlow);
  private readonly report = inject(ReportImport, { optional: true });

  protected readonly headingId = STEP_HEADING_ID;
  protected readonly brand = APP_BRAND;
  protected readonly photo = WELCOME_PHOTO;
  protected readonly benefits = BENEFITS;
  protected readonly reportUploadAvailable = this.report?.available ?? false;

  /** "Get started": set up by answering the questions (forgetting any report read earlier). */
  submit(): boolean {
    if (this.flow.draft().setupMethod === 'report') {
      this.report?.reset();
      this.flow.update({ setupMethod: 'manual' });
    }
    return true;
  }

  protected setUpFromReport(): void {
    this.flow.update({ setupMethod: 'report' });
    this.flow.next();
  }
}
