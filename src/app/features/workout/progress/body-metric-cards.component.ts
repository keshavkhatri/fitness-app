import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { BodyMetricView } from './progress-view-model';

/**
 * The latest body recordings (weight, body fat, muscle mass): value and unit
 * as recorded, the difference from the previous recording with its date
 * (arrow and sign, never judged good or bad), or "Not recorded". Each card
 * opens where that metric is recorded.
 */
@Component({
  selector: 'app-body-metric-cards',
  template: `
    <ul class="body-cards">
      @for (m of metrics(); track m.key) {
        <li class="body-card" [attr.data-key]="m.key">
          <button type="button" class="body-button" (click)="openMetric.emit(m.key)">
            <span class="body-label">{{ m.label }}</span>
            @if (m.value !== null) {
              <span class="body-value"><span class="number">{{ m.value }}</span>&ngsp;<span class="unit">{{ m.unit }}</span></span>
              @if (m.change; as c) {
                <span class="body-change" [attr.data-direction]="c.direction">
                  @if (c.direction !== 'same') {
                    <ion-icon [name]="c.direction === 'up' ? 'arrow-up' : 'arrow-down'" aria-hidden="true" />
                  }
                  <span aria-hidden="true">{{ c.text }}</span><span class="visually-hidden">{{ c.spoken }}</span>
                </span>
              }
            } @else {
              <span class="body-value empty">–</span>
            }
            <span class="body-caption">{{ m.caption }}</span>
          </button>
        </li>
      }
    </ul>
  `,
  styleUrl: './body-metric-cards.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BodyMetricCardsComponent {
  readonly metrics = input.required<readonly BodyMetricView[]>();
  readonly openMetric = output<BodyMetricView['key']>();
}
