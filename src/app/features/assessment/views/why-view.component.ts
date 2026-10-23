import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { NoticeComponent } from '../../../shared/ui';
import { ASSESSMENT_COPY, WHY_COPY } from '../assessment-content';
import { AssessmentViewModel } from '../assessment-view-model';

/** Why these numbers? (dark): each step of the engine's calculation, the confidence and its inputs. */
@Component({
  selector: 'app-assessment-why',
  template: `
    @let v = view();
    <p class="lead">{{ copy.intro }}</p>

    <ol class="steps" data-testid="calculation-steps">
      @for (step of v.calculation.steps; track step.key) {
        <li class="step" [class.target]="step.key === 'target'" [attr.data-step]="step.key">
          <span class="icon" aria-hidden="true"><ion-icon [name]="step.icon" /></span>
          <span class="step-text">
            <span class="step-label">{{ step.label }}</span>&ngsp;
            <span class="step-caption">{{ step.caption }}</span>
          </span>
          <span class="step-value" [attr.aria-hidden]="step.spokenValue ? 'true' : null">{{ step.value }}</span>
          @if (step.spokenValue) {
            <span class="visually-hidden">{{ step.spokenValue }}</span>
          }
        </li>
      }
    </ol>

    @if (v.calculation.notice; as notice) {
      <fit-notice [tone]="notice.tone" [title]="notice.title" data-testid="calculation-notice">{{ notice.message }}</fit-notice>
    }

    <section class="confidence" aria-labelledby="why-confidence">
      <ion-icon name="stats-chart" aria-hidden="true" />
      <div>
        <h2 class="confidence-title" id="why-confidence">
          {{ text.confidenceTitle }}
          <span class="pill" data-testid="confidence-label">{{ v.confidence.label }}</span>
        </h2>
        <p class="confidence-text">{{ v.confidence.description }}</p>
      </div>
    </section>

    <section class="factors">
      <h2 class="factors-heading">
        <button
          type="button"
          class="factors-toggle"
          aria-controls="assessment-factors"
          [attr.aria-expanded]="factorsOpen()"
          (click)="factorsOpen.set(!factorsOpen())"
        >
          <ion-icon name="list-outline" aria-hidden="true" />
          <span>{{ text.factorsTitle }}</span>
          <ion-icon class="chevron" name="chevron-down" aria-hidden="true" />
        </button>
      </h2>
      <dl class="factor-list" id="assessment-factors" [hidden]="!factorsOpen()" data-testid="factors">
        @for (factor of v.calculation.factors; track factor.label) {
          <div class="factor">
            <dt>{{ factor.label }}</dt>
            <dd>{{ factor.value }}</dd>
          </div>
        }
      </dl>
    </section>
  `,
  styleUrls: ['./why-view.component.scss', './why-factors.scss'],
  imports: [IonIcon, NoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhyViewComponent {
  readonly view = input.required<AssessmentViewModel>();
  protected readonly copy = ASSESSMENT_COPY.views.why;
  protected readonly text = WHY_COPY;
  protected readonly factorsOpen = signal(false);
}
