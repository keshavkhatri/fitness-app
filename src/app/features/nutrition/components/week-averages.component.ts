import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessProgressComponent } from '../../../shared/ui';
import { AverageTileView } from '../nutrition-week-view-model';

/**
 * "Average this week": daily averages over the days with food logged. With
 * a target, calories show the difference from it and macros the share of it;
 * without one, only the average is shown (nothing invented).
 */
@Component({
  selector: 'app-week-averages',
  template: `
    <section class="averages" aria-labelledby="week-average-title">
      <h2 class="title" id="week-average-title">{{ title() }}</h2>
      <ul class="tiles">
        @for (t of tiles(); track t.key) {
          <li class="tile" [attr.data-testid]="'average-' + t.key">
            <span class="visually-hidden">{{ t.spoken }}</span>
            <span class="value" aria-hidden="true">{{ t.value }}</span>
            <span class="label" aria-hidden="true">{{ t.label }}</span>
            @if (t.comparison; as c) {
              <span class="comparison" [attr.data-direction]="t.direction" aria-hidden="true">
                @if (t.direction === 'up' || t.direction === 'down') {
                  <ion-icon [name]="t.direction === 'up' ? 'arrow-up' : 'arrow-down'" />
                }
                {{ c }}
              </span>
              @if (t.key === 'calories') {
                <span class="label" aria-hidden="true">vs target</span>
              }
            }
            @if (t.progress; as p) {
              <fit-progress class="bar" [value]="p.value" [max]="p.max" [label]="t.label + ' daily average'" [valueText]="p.valueText" />
            }
          </li>
        }
      </ul>
      @if (comparison(); as c) {
        <p class="comparison-line" data-testid="average-comparison">{{ c }}</p>
      }
      <p class="caption">{{ caption() }}</p>
      @if (note(); as n) {
        <p class="caption" data-testid="target-note">{{ n }}</p>
      }
    </section>
  `,
  styleUrl: './week-averages.component.scss',
  imports: [IonIcon, FitnessProgressComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeekAveragesComponent {
  readonly title = input.required<string>();
  readonly tiles = input.required<readonly AverageTileView[]>();
  readonly caption = input.required<string>();
  /** "50 kcal over your daily target" (calories, with a target). */
  readonly comparison = input<string | null>(null);
  /** Why targets aren't compared, when they aren't. */
  readonly note = input<string | null>(null);
}
