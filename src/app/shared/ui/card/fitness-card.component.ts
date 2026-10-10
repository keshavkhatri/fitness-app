import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type FitnessCardPadding = 'none' | 'sm' | 'md';
/** `ink`: the single dark hero surface of a screen. */
export type FitnessCardTone = 'default' | 'muted' | 'ink';

/** Base surface for grouped content. Purely presentational. */
@Component({
  selector: 'fit-card',
  template: '<ng-content />',
  styleUrl: './fitness-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-padding]': 'padding()',
    '[attr.data-tone]': 'tone()',
  },
})
export class FitnessCardComponent {
  readonly padding = input<FitnessCardPadding>('md');
  readonly tone = input<FitnessCardTone>('default');
}
