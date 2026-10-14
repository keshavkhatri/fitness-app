import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { WORKOUT_COPY } from '../../workout-content';
import { InsightsView } from '../workout-summary-view-model';

const CHANGE_ICONS = { up: 'arrow-up', down: 'arrow-down', same: 'remove' } as const;

/** Performance insights (dark): this workout against earlier ones of the same kind. */
@Component({
  selector: 'app-summary-insights',
  template: `
    @let i = insights();
    <header class="header">
      <h1 class="title" tabindex="-1" data-view-heading>{{ copy.title }}</h1>
      <p class="lead">{{ i ? copy.intro(i.comparedWith) : copy.unavailable }}</p>
    </header>

    @if (i) {
      <dl class="metrics" data-testid="insight-metrics">
        @for (metric of i.metrics; track metric.key) {
          <div class="metric" [attr.data-key]="metric.key">
            <ion-icon class="metric-icon" [name]="metric.icon" aria-hidden="true" />
            <dt class="label">{{ metric.label }}</dt>&ngsp;
            <dd class="value">{{ metric.value }}</dd>&ngsp;
            @if (metric.change; as change) {
              <dd class="change" [attr.data-direction]="change.direction">
                <ion-icon [name]="icons[change.direction]" aria-hidden="true" />
                <span aria-hidden="true">{{ change.text }}</span>
                <span class="visually-hidden">{{ change.spoken }}</span>
              </dd>
            }
          </div>&ngsp;
        }
      </dl>

      @if (i.previousCount === 0) {
        <aside class="note" data-testid="insights-no-history">
          <ion-icon name="time-outline" aria-hidden="true" />
          <p><strong>{{ copy.noHistory.title }}</strong> {{ copy.noHistory.text(i.comparedWith) }}</p>
        </aside>
      }

      @if (i.trend; as trend) {
        <section class="trend" aria-labelledby="summary-trend-title" data-testid="volume-trend">
          <h2 class="trend-title" id="summary-trend-title">{{ copy.trendTitle }}</h2>
          <p class="trend-caption">{{ copy.trendCaption(i.comparedWith, trend.unit) }}</p>
          <p class="visually-hidden">{{ trend.spoken }}</p>
          <ol class="bars" aria-hidden="true">
            @for (bar of trend.bars; track bar.key) {
              <li class="bar" [class.current]="bar.current">
                <span class="bar-value">{{ bar.value }}</span>
                <span class="bar-track"><span class="bar-fill" [style.height.%]="bar.height * 100"></span></span>
                <span class="bar-label">{{ bar.label }}</span>
              </li>
            }
          </ol>
        </section>
      }

      @if (i.best; as best) {
        <aside class="best" data-testid="insights-best">
          <ion-icon name="trophy-outline" aria-hidden="true" />
          <p><strong>{{ best.title }}</strong> {{ best.text }}</p>
        </aside>
      }
    }
  `,
  styleUrl: './insights-view.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SummaryInsightsComponent {
  /** null when history couldn't be read. */
  readonly insights = input.required<InsightsView | null>();
  protected readonly copy = WORKOUT_COPY.summary.insights;
  protected readonly icons = CHANGE_ICONS;
}
