import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessTone } from '../tone';

/** Small, non-interactive status label (e.g. "Demo data", "Coming soon"). */
@Component({
  selector: 'fit-chip',
  template: `
    @if (icon(); as iconName) {
      <ion-icon [name]="iconName" aria-hidden="true" />
    }
    <ng-content />
  `,
  styleUrl: './fitness-chip.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-tone]': 'tone()' },
})
export class FitnessChipComponent {
  readonly tone = input<FitnessTone>('neutral');
  readonly icon = input<string>();
}
