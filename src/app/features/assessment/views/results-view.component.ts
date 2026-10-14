import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { NoticeComponent } from '../../../shared/ui';
import { ASSESSMENT_COPY } from '../assessment-content';
import { AssessmentViewModel } from '../assessment-view-model';
import { MACRO_ICONS } from './macro-icons';

/** Assessment results (dark): confidence, calorie target, macros, goal and the profile it is based on. */
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
      <p class="lead">{{ copy.intro }}</p>
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
  `,
  styleUrls: ['./results-view.component.scss', './results-facts.scss'],
  imports: [IonIcon, NoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultsViewComponent {
  readonly view = input.required<AssessmentViewModel>();
  protected readonly copy = ASSESSMENT_COPY;
  protected readonly icons = MACRO_ICONS;
}
