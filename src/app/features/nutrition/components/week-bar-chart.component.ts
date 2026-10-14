import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';

import { NUTRITION_COPY } from '../nutrition-content';
import { WeekChartView } from '../nutrition-week-chart';

/**
 * Seven day columns: the day's value as a filled bar, and the daily target
 * (when there is one) as a dashed outline behind it, so intake and target
 * read apart without colour alone. Days without entries have no bar and a
 * dash; upcoming days are faint. The drawing is hidden from assistive tech;
 * an equivalent list is read instead.
 */
@Component({
  selector: 'app-week-bar-chart',
  template: `
    @let c = chart();
    <div class="chart" aria-hidden="true">
      <div class="axis">
        @for (t of c.ticks; track $index) {
          <span class="tick" [style.bottom.%]="t.position">{{ t.label }}</span>
        }
      </div>
      <div class="plot">
        @for (t of c.ticks; track $index) {
          <span class="grid" [style.bottom.%]="t.position"></span>
        }
        @for (b of c.bars; track b.date) {
          <div class="column" [attr.data-status]="b.status">
            @if (c.targetHeight !== null && b.status !== 'upcoming') {
              <span class="target" [style.height.%]="c.targetHeight"></span>
            }
            @if (b.height !== null) {
              <span class="bar" [style.height.%]="b.height"></span>
            } @else if (b.status === 'not-logged') {
              <span class="missing">–</span>
            }
          </div>
        }
      </div>
      <div class="letters">
        @for (b of c.bars; track b.date) {
          <span class="letter" [class.today]="b.isToday">{{ b.letter }}</span>
        }
      </div>
    </div>
    @if (legend()) {
      <ul class="legend" aria-hidden="true">
        <li><span class="swatch swatch-food"></span>{{ copy.legendFood }}</li>
        @if (c.targetHeight !== null) {
          <li><span class="swatch swatch-target"></span>{{ copy.legendTarget }}</li>
        }
        <li>{{ copy.legendNotLogged }}</li>
      </ul>
    }
    <ul class="visually-hidden" [attr.aria-label]="label()">
      @for (b of c.bars; track b.date) {
        <li>{{ b.spoken }}</li>
      }
      @if (c.targetText; as target) {
        <li>{{ target }}</li>
      }
    </ul>
  `,
  styleUrl: './week-bar-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeekBarChartComponent {
  readonly chart = input.required<WeekChartView>();
  /** Accessible name of the value list ("Calories by day"). */
  readonly label = input.required<string>();
  /** Show the Food / Daily target / Not logged key under the chart. */
  readonly legend = input(false, { transform: booleanAttribute });

  protected readonly copy = NUTRITION_COPY.week;
}
