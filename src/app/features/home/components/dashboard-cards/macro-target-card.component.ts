import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent, FitnessProgressComponent } from '../../../../shared/ui';
import { MacroRingView } from '../../home-dashboard';

/** Protein, calories, carbs and fats eaten today, each a ring against its target. Opens Nutrition. */
@Component({
  selector: 'app-macro-target-card',
  template: `
    <fit-card>
      <div class="head">
        <h2 class="title">
          <button type="button" class="title-link" data-testid="home-macros-open" (click)="open.emit()">
            <ion-icon name="locate-outline" aria-hidden="true" />Macronutrient target
          </button>
        </h2>
        <span class="chevron" aria-hidden="true"><ion-icon name="chevron-forward" /></span>
      </div>
      <ul class="rings">
        @for (ring of rings(); track ring.key) {
          <li [attr.data-key]="ring.key" [attr.data-testid]="'home-ring-' + ring.key">
            <fit-progress variant="ring" [label]="ring.label" [ringSize]="68" [thickness]="4.2" [enterDelay]="$index * 120" [value]="ring.value" [max]="ring.max" [valueText]="ring.valueText">
              <span class="eaten" [class.long]="ring.eaten.length > 4">{{ ring.eaten }}</span>
              @if (ring.target) {
                <span class="target" [class.long]="ring.target.length > 7">{{ ring.target }}</span>
              }
            </fit-progress>
            <span class="label" aria-hidden="true">{{ ring.label }}</span>
          </li>
        }
      </ul>
    </fit-card>
  `,
  styleUrl: './macro-target-card.component.scss',
  imports: [IonIcon, FitnessCardComponent, FitnessProgressComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MacroTargetCardComponent {
  readonly rings = input.required<readonly MacroRingView[]>();
  readonly open = output<void>();
}
