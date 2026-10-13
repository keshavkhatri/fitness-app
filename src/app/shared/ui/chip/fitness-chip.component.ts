import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessTone } from '../tone';

export type FitnessChipFill = 'soft' | 'solid';

/**
 * Small, non-interactive status label (e.g. "Demo data", "Coming soon").
 * `fill="solid"` is the stronger badge for a live state ("Active", "Done");
 * at most one solid chip per card.
 */
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
  host: { '[attr.data-tone]': 'tone()', '[attr.data-fill]': 'fill()' },
})
export class FitnessChipComponent {
  readonly tone = input<FitnessTone>('neutral');
  readonly icon = input<string>();
  readonly fill = input<FitnessChipFill>('soft');
}
