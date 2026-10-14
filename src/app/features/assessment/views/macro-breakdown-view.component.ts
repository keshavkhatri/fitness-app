import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { NoticeComponent } from '../../../shared/ui';
import { ASSESSMENT_COPY } from '../assessment-content';
import { MacrosViewModel } from '../assessment-view-model';
import { DONUT, donutSlices } from './macro-donut';
import { MACRO_ICONS } from './macro-icons';

/** Macro breakdown (light): the calorie target split into protein, carbohydrates and fat. */
@Component({
  selector: 'app-assessment-macros',
  template: `
    <header class="header">
      <h1 class="title" tabindex="-1" data-view-heading>{{ copy.title }}</h1>
      <p class="lead">{{ copy.intro }}</p>
    </header>

    @let m = macros();
    @if (m.kind === 'grams') {
      @if (m.notice; as notice) {
        <fit-notice [tone]="notice.tone" [title]="notice.title">{{ notice.message }}</fit-notice>
      }
      <figure class="chart" data-testid="macro-chart">
        <svg [attr.viewBox]="'0 0 ' + donut.size + ' ' + donut.size" role="img" [attr.aria-label]="summary()">
          <circle class="track" [attr.cx]="donut.size / 2" [attr.cy]="donut.size / 2" [attr.r]="donut.radius" />
          @for (slice of slices(); track slice.key) {
            <circle
              class="slice"
              [attr.data-macro]="slice.key"
              [attr.cx]="donut.size / 2"
              [attr.cy]="donut.size / 2"
              [attr.r]="donut.radius"
              [attr.stroke-dasharray]="slice.dasharray"
              [attr.stroke-dashoffset]="slice.dashoffset"
            />
          }
        </svg>
        <figcaption class="center" aria-hidden="true">
          <span class="total">{{ m.totalKcal }}</span>
          <span class="total-unit">kcal a day</span>
        </figcaption>
      </figure>

      <ul class="rows" data-testid="macro-rows">
        @for (row of m.rows; track row.key) {
          <li class="row" [attr.data-macro]="row.key">
            <span class="icon" aria-hidden="true"><ion-icon [name]="icons[row.key]" /></span>
            <span class="row-text">
              <span class="row-label">{{ row.label }}</span>&ngsp;
              <span class="row-grams">{{ row.grams }}</span>&ngsp;
              <span class="row-detail">{{ row.percent }} of calories ({{ row.kcal }})</span>
            </span>
            <span class="swatch" aria-hidden="true"></span>
          </li>
        }
      </ul>

      <aside class="focus">
        <ion-icon name="information-circle-outline" aria-hidden="true" />
        <p>{{ m.focus }}</p>
      </aside>
    } @else {
      <fit-notice [tone]="m.notice.tone" [title]="m.notice.title" data-testid="macros-unavailable">{{ m.notice.message }}</fit-notice>
    }
  `,
  styleUrl: './macro-breakdown-view.component.scss',
  imports: [IonIcon, NoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MacroBreakdownViewComponent {
  readonly macros = input.required<MacrosViewModel>();

  protected readonly copy = ASSESSMENT_COPY.views.macros;
  protected readonly icons = MACRO_ICONS;
  protected readonly donut = DONUT;
  protected readonly slices = computed(() => {
    const m = this.macros();
    return m.kind === 'grams' ? donutSlices(m.rows) : [];
  });
  /** The chart in words, for screen readers. */
  protected readonly summary = computed(() => {
    const m = this.macros();
    if (m.kind !== 'grams') {
      return '';
    }
    const parts = m.rows.map((row) => `${row.label} ${row.percent} (${row.grams})`).join(', ');
    return `${m.totalKcal} kilocalories a day: ${parts}`;
  });
}
