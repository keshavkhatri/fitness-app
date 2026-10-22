import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent } from '../../../../shared/ui';
import { MilestoneView } from '../../home-dashboard';

/** Days to the next streak milestone, one dot per day of it, and a little summit. Opens the streak page. */
@Component({
  selector: 'app-milestone-card',
  template: `
    @let m = milestone();
    <fit-card>
      <div class="head">
        <h2 class="title">
          <button type="button" class="title-link" data-testid="home-milestone-open" [attr.aria-label]="'Next milestone. ' + m.accessibleLabel" (click)="open.emit()">
            <span class="flame" aria-hidden="true">🔥</span>Next milestone
          </button>
        </h2>
        <span class="chevron" aria-hidden="true"><ion-icon name="chevron-forward" /></span>
      </div>
      <div aria-hidden="true">
        <p class="headline" data-testid="home-milestone-days">{{ m.headline }}</p>
        <p class="caption">{{ m.caption }}</p>
      </div>
      <div class="foot" aria-hidden="true">
        @if (m.dots; as dots) {
          <span class="dots">
            @for (done of dots; track $index) {
              <span class="dot" [class.done]="done" [style.--i]="$index">
                @if (done) {
                  <ion-icon name="checkmark" />
                }
              </span>
            }
          </span>
        } @else {
          <span class="track"><span class="fill" [style.width.%]="m.progress * 100"></span></span>
        }
        <svg class="summit" viewBox="0 0 64 48">
          <g class="peaks">
            <path d="M2 46 L24 14 L32 24 L40 12 L62 46 Z" fill="#8a7f72" />
            <path d="M24 14 L32 24 L28 30 L20 26 Z M40 12 L46 21 L41 25 L36 18 Z" fill="#b9ada0" />
            <path d="M14 46 L30 26 L44 46 Z" fill="#6f655a" />
            <line x1="40" y1="12" x2="40" y2="1" stroke="#5c5f57" stroke-width="1.5" />
            <path class="flag" d="M40 1 L49 4 L40 7 Z" fill="#e5484d" />
          </g>
        </svg>
      </div>
    </fit-card>
  `,
  styleUrl: './milestone-card.component.scss',
  imports: [IonIcon, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MilestoneCardComponent {
  readonly milestone = input.required<MilestoneView>();
  readonly open = output<void>();
}
