import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent } from '../../../../shared/ui';
import { FocusItemView } from '../../home-dashboard';

const ICONS: Readonly<Record<FocusItemView['key'], string>> = { steps: 'walk', protein: 'barbell', sleep: 'moon' };

/** Today's aims: steps (logs steps), protein (opens Nutrition) and sleep (a reminder only: sleep isn't tracked). */
@Component({
  selector: 'app-today-focus-card',
  template: `
    <fit-card>
      <div class="head">
        <h2 class="title"><ion-icon name="locate-outline" aria-hidden="true" />Today's focus</h2>
      </div>
      <ul class="items">
        @for (item of items(); track item.key) {
          <li [attr.data-key]="item.key">
            @if (item.key === 'sleep') {
              <div class="item" [attr.aria-label]="item.ariaLabel" role="group">
                <ion-icon [name]="icons[item.key]" aria-hidden="true" />
                <span class="text" aria-hidden="true"><span class="value">{{ item.value }}</span><span class="label">{{ item.label }}</span></span>
              </div>
            } @else {
              <button type="button" class="item" [attr.data-testid]="'home-focus-' + item.key" [attr.aria-label]="item.ariaLabel" (click)="act.emit(item.key)">
                <ion-icon [name]="icons[item.key]" aria-hidden="true" />
                <span class="text" aria-hidden="true"><span class="value">{{ item.value }}</span><span class="label">{{ item.label }}</span></span>
              </button>
            }
          </li>
        }
      </ul>
    </fit-card>
  `,
  styleUrl: './today-focus-card.component.scss',
  imports: [IonIcon, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodayFocusCardComponent {
  readonly items = input.required<readonly FocusItemView[]>();
  readonly act = output<'steps' | 'protein'>();

  protected readonly icons = ICONS;
}
