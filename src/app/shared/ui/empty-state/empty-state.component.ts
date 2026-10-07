import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

/**
 * Explains why a section is empty and what will appear there.
 * Optional actions are projected below the description.
 */
@Component({
  selector: 'fit-empty-state',
  template: `
    @if (icon(); as iconName) {
      <div class="icon" aria-hidden="true"><ion-icon [name]="iconName" /></div>
    }
    <h2 class="title">{{ title() }}</h2>
    @if (description(); as text) {
      <p class="description">{{ text }}</p>
    }
    <div class="actions"><ng-content /></div>
  `,
  styleUrl: './empty-state.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly description = input<string>();
  readonly icon = input<string>();
}
