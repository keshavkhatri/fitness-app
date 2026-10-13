import { ChangeDetectionStrategy, Component, computed, input, numberAttribute } from '@angular/core';
import { IonIcon } from '@ionic/angular';

/**
 * The user's avatar: their photo, else their initials, else a person icon.
 * Decorative by default (the control around it names the action); pass
 * `label` when it stands alone.
 */
@Component({
  selector: 'fit-avatar',
  template: `
    @if (photo(); as src) {
      <img [src]="src" alt="" />
    } @else if (initials(); as letters) {
      <span class="initials">{{ letters }}</span>
    } @else {
      <ion-icon name="person" />
    }
  `,
  styleUrl: './fitness-avatar.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label() ?? null',
    '[attr.aria-hidden]': 'label() ? null : "true"',
    '[style.--avatar-size.px]': 'size()',
  },
})
export class FitnessAvatarComponent {
  readonly name = input<string | null>(null);
  /** An image URL (e.g. the saved data URL). */
  readonly photo = input<string | null>(null);
  readonly size = input(40, { transform: numberAttribute });
  readonly label = input<string>();

  protected readonly initials = computed(() => {
    const parts = (this.name() ?? '').split(' ').filter(Boolean);
    if (parts.length === 0) {
      return null;
    }
    const letters = parts.length === 1 ? [parts[0]] : [parts[0], parts[parts.length - 1]];
    return letters.map((p) => p.charAt(0).toLocaleUpperCase()).join('');
  });
}
