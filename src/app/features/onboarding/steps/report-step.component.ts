import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { MAX_REPORT_BYTES } from '../../../core/inbody/inbody-extraction.client';
import { INBODY_REPORT_MEDIA_TYPES } from '../../../domain/inbody-extraction';
import { AnalysisOverlayComponent, FitnessButtonComponent, FitnessCardComponent, NoticeComponent } from '../../../shared/ui';
import { BODY_COMPOSITION_COPY } from '../../body-composition/body-composition-content';
import { OnboardingFlow } from '../state/onboarding-flow.service';
import { ReportImport } from '../state/report-import.service';
import { REPORT_FAILURE_COPY, reportIssueText, reportReviewSummary } from '../state/report-review';
import { OnboardingStepForm, STEP_HEADING_ID } from './onboarding-step-form';

const MIB = 1024 * 1024;

/**
 * Upload an InBody report: explains where the image goes, takes one image
 * and has it read (the page's primary action). Nothing is filled in here:
 * a successful read continues to the basics step, prefilled for review.
 * Manual entry stays one tap away throughout.
 */
@Component({
  selector: 'app-report-step',
  templateUrl: './report-step.component.html',
  styleUrl: './report-step.component.scss',
  imports: [IonIcon, AnalysisOverlayComponent, FitnessButtonComponent, FitnessCardComponent, NoticeComponent],
  providers: [{ provide: OnboardingStepForm, useExisting: ReportStepComponent }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportStepComponent implements OnboardingStepForm {
  private readonly flow = inject(OnboardingFlow);
  protected readonly report = inject(ReportImport);

  protected readonly headingId = STEP_HEADING_ID;
  protected readonly accept = INBODY_REPORT_MEDIA_TYPES.join(',');
  protected readonly maxMegabytes = MAX_REPORT_BYTES / MIB;
  protected readonly state = this.report.current;
  /** The full-screen wait while the report is read (shared with the body-composition upload). */
  protected readonly analysis = BODY_COMPOSITION_COPY.upload.analysis;
  /** Shown when the user asks to read a report before choosing one. */
  protected readonly prompt = signal<string | null>(null);

  protected readonly file = computed(() => {
    const state = this.state();
    return state.status === 'selected' || state.status === 'reading' || state.status === 'failed' ? state.file : null;
  });
  protected readonly failure = computed(() => {
    const state = this.state();
    return state.status === 'failed'
      ? { ...REPORT_FAILURE_COPY[state.failure], issues: reportIssueText(state.reportIssues) }
      : null;
  });
  protected readonly summary = computed(() => {
    const reading = this.report.reading();
    return reading ? reportReviewSummary(reading) : null;
  });

  /** Leaves the full-screen wait: the reading is abandoned (a late answer is dropped). */
  protected cancelReading(): void {
    this.report.reset();
  }

  readonly busy = computed(() => this.state().status === 'reading');
  readonly primaryLabel = computed(() => {
    if (!this.report.available) {
      return 'Enter my details';
    }
    const state = this.state();
    switch (state.status) {
      case 'reading':
        return 'Reading your report…';
      case 'read':
        return 'Check my details';
      case 'failed':
        return state.file ? 'Try again' : null;
      default:
        return null;
    }
  });

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly chooseButton = viewChild('chooseButton', { read: ElementRef<HTMLButtonElement> });

  protected chooseImage(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected onImageChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared so choosing the same file again still counts as a choice.
    input.value = '';
    if (file) {
      this.prompt.set(null);
      this.report.choose(file);
    }
  }

  protected useManualEntry(): void {
    this.report.reset();
    this.flow.useManualEntry();
  }

  protected fileSize(file: File): string {
    return file.size >= MIB ? `${(file.size / MIB).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
  }

  /** Continues once the report is read; otherwise starts reading the chosen image. */
  submit(): boolean {
    if (!this.report.available) {
      this.useManualEntry();
      return false;
    }
    const state = this.state();
    switch (state.status) {
      case 'read':
        return true;
      case 'reading':
        return false;
      case 'selected':
        this.prompt.set(null);
        void this.report.read();
        return false;
      case 'failed':
        if (state.file) {
          void this.report.read();
          return false;
        }
        break;
    }
    this.prompt.set('Choose an image of your report first.');
    this.chooseButton()?.nativeElement.focus();
    return false;
  }
}
