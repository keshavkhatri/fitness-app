import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

/** `on-ink`: the main action on an ink (hero) surface. */
export type FitnessButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'on-ink' | 'ghost-ink';
export type FitnessButtonSize = 'md' | 'lg';

/**
 * Button styling applied to a native <button> or <a>, so semantics, focus,
 * `disabled` and form behaviour stay native.
 *
 * <button fit-button variant="primary" icon="play-outline">Start workout</button>
 *
 * `loading` shows a spinner and sets aria-busy; also set `disabled` on the
 * element to prevent repeat submissions.
 */
@Component({
  selector: 'button[fit-button], a[fit-button]',
  template: `
    @if (loading()) {
      <span class="spinner" aria-hidden="true"></span>
    } @else if (icon(); as iconName) {
      <ion-icon [name]="iconName" aria-hidden="true" />
    }
    <span class="label"><ng-content /></span>
  `,
  styleUrl: './fitness-button.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-variant]': 'variant()',
    '[attr.data-size]': 'size()',
    '[class.block]': 'block()',
    '[attr.aria-busy]': 'loading() ? "true" : null',
  },
})
export class FitnessButtonComponent {
  readonly variant = input<FitnessButtonVariant>('primary');
  readonly size = input<FitnessButtonSize>('md');
  readonly icon = input<string>();
  readonly block = input(false, { transform: booleanAttribute });
  readonly loading = input(false, { transform: booleanAttribute });
}
