import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

/**
 * Placeholder artwork for a food or meal (no food photos exist in the app):
 * a tinted tile with a neutral icon. Decorative; the food's name is always
 * in the surrounding text.
 */
@Component({
  selector: 'app-food-thumb',
  template: `<ion-icon [name]="icon()" aria-hidden="true" />`,
  styles: `
    :host {
      display: grid;
      flex: none;
      place-items: center;
      width: var(--thumb-size, 48px);
      height: var(--thumb-size, 48px);
      border-radius: var(--thumb-radius, var(--radius-md));
      background: radial-gradient(circle at 30% 25%, var(--color-primary-soft), var(--color-surface-muted) 70%);
      color: var(--color-primary-strong);
      font-size: calc(var(--thumb-size, 48px) * 0.45);
    }
  `,
  host: { 'aria-hidden': 'true' },
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoodThumbComponent {
  readonly icon = input('nutrition-outline');
}
