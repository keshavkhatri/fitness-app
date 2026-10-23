import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { NoticeComponent } from '../../../shared/ui';
import { ASSESSMENT_COPY } from '../assessment-content';
import { AssessmentViewModel } from '../assessment-view-model';
import { MACRO_ICONS } from './macro-icons';
import { WhyViewComponent } from './why-view.component';

/**
 * The whole assessment on one screen (dark): confidence, calorie target, macros, goal, the profile it is based on,
 * and (folded away) the goal, the profile and how the numbers were worked out.
 */
@Component({
  selector: 'app-assessment-results',
  template: `
    @let v = view();
    <header class="header">
      <p class="confidence" data-testid="confidence-chip">
        <ion-icon name="stats-chart" aria-hidden="true" />
        <span><span class="visually-hidden">Estimate confidence: </span>{{ v.confidence.label }} confidence</span>
      </p>
      <h1 class="title" tabindex="-1" data-view-heading>{{ copy.title }}</h1>
    </header>

    @let target = v.energy.calorieTarget;
    @if (target.kind === 'target') {
      <section class="calories" data-testid="calorie-target" aria-labelledby="calorie-label">
        <ion-icon class="flame" name="flame" aria-hidden="true" />
        <div>
          <h2 class="calories-label" id="calorie-label">Daily calorie target</h2>
          <p class="calories-value">
            <span class="number">{{ target.kcal }}</span>
            <span class="unit" aria-hidden="true">kcal</span>
            <span class="visually-hidden">kilocalories per day</span>
          </p>
          <p class="calories-caption" data-testid="maintenance-caption">
            Maintenance {{ v.energy.maintenance }}
          </p>
        </div>
      </section>
      @if (target.notice; as notice) {
        <fit-notice [tone]="notice.tone" [title]="notice.title">{{ notice.message }}</fit-notice>
      }
    } @else {
      <fit-notice tone="warning" [title]="target.notice.title" data-testid="calorie-review">{{ target.notice.message }}</fit-notice>
    }

    @let m = v.macros;
    @if (m.kind === 'grams') {
      @if (m.notice; as notice) {
        <fit-notice [tone]="notice.tone" [title]="notice.title" data-testid="macro-notice">{{ notice.message }}</fit-notice>
      }
      <dl class="macros" data-testid="macro-grams" aria-label="Daily macro targets">
        @for (row of m.rows; track row.key) {
          <div class="macro" [attr.data-macro]="row.key">
            <ion-icon [name]="icons[row.key]" aria-hidden="true" />
            <dt class="macro-label">{{ row.label }}</dt>&ngsp;
            <dd class="macro-grams">{{ row.grams }}</dd>&ngsp;
            <dd class="macro-share"><span class="visually-hidden">of calories: </span>{{ row.percent }}</dd>
          </div>&ngsp;
        }
      </dl>
    } @else {
      <fit-notice [tone]="m.notice.tone" [title]="m.notice.title" data-testid="macros-unavailable">{{ m.notice.message }}</fit-notice>
    }

    <section class="how" aria-labelledby="how-heading">
      <h2 class="how-heading" id="how-heading">
        <button type="button" class="how-toggle" data-testid="how-toggle" aria-controls="assessment-how" [attr.aria-expanded]="howOpen()" (click)="howOpen.set(!howOpen())">
          <ion-icon name="calculator-outline" aria-hidden="true" />
          <span>Details and how we worked this out</span>
          <ion-icon class="chevron" name="chevron-down" aria-hidden="true" />
        </button>
      </h2>
      <div id="assessment-how" class="how-body" [hidden]="!howOpen()">
        @if (m.kind === 'grams') {
          <p class="macro-focus" data-testid="macro-focus">{{ m.focus }}</p>
        }
        <section class="goal" aria-labelledby="goal-label">
          <span class="goal-icon" aria-hidden="true"><ion-icon name="locate-outline" /></span>
          <div class="goal-text">
            <h2 class="small-label" id="goal-label">Goal focus</h2>
            <p class="goal-value" data-testid="goal-label">{{ v.goal.label }}</p>
            @if (v.goal.target; as goalTarget) {
              <p class="goal-target" data-testid="goal-target">{{ goalTarget.summary }} · {{ goalTarget.detail }}</p>
            }
          </div>
        </section>

        <dl class="facts" aria-label="Based on">
          <div class="fact">
            <ion-icon name="scale-outline" aria-hidden="true" />
            <dt class="small-label">Weight</dt>
            <dd class="fact-value" data-testid="fact-weight">{{ v.profile.weight }}</dd>
          </div>
          <div class="fact">
            <ion-icon name="resize-outline" aria-hidden="true" />
            <dt class="small-label">Height</dt>
            <dd class="fact-value" data-testid="fact-height">{{ v.profile.height }}</dd>
          </div>
          <div class="fact wide">
            <ion-icon name="walk-outline" aria-hidden="true" />
            <dt class="small-label">Activity level</dt>
            <dd class="fact-value" data-testid="fact-activity">{{ v.profile.activity }}</dd>
            <dd class="fact-detail">{{ v.profile.activityDetail }}</dd>
          </div>
        </dl>
        @if (howOpen()) {
          <app-assessment-why [view]="v" />
        }
      </div>
    </section>
  `,
  styleUrls: ['./results-view.component.scss', './results-facts.scss'],
  imports: [IonIcon, NoticeComponent, WhyViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultsViewComponent {
  readonly view = input.required<AssessmentViewModel>();
  protected readonly copy = ASSESSMENT_COPY;
  protected readonly icons = MACRO_ICONS;
  protected readonly howOpen = signal(false);
}
