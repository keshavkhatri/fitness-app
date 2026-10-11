import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

/**
 * `plain`: toolbar/header actions. `tonal`: secondary actions on a surface.
 * `primary`: the one icon-only main action (filled with the brand color).
 */
export type FitnessIconButtonVariant = 'plain' | 'tonal' | 'primary';
export type FitnessIconButtonSize = 'md' | 'lg';

/**
 * Icon-only button on a native <button> or <a>, so semantics, focus and
 * `disabled` stay native. The icon is decorative: the element needs an
 * `aria-label` (template lint, `elements-content`, rejects a button without one).
 *
 * <button fit-icon-button type="button" icon="close" aria-label="Close"></button>
 *
 * Always at least a full touch target (44px; 52px for `lg`).
 */
@Component({
  selector: 'button[fit-icon-button], a[fit-icon-button]',
  template: `<ion-icon [name]="icon()" aria-hidden="true" />`,
  styleUrl: './fitness-icon-button.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-variant]': 'variant()',
    '[attr.data-size]': 'size()',
  },
})
export class FitnessIconButtonComponent {
  readonly icon = input.required<string>();
  readonly variant = input<FitnessIconButtonVariant>('plain');
  readonly size = input<FitnessIconButtonSize>('md');
}
