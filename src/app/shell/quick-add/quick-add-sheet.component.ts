import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { BottomSheetComponent } from '../../shared/ui';
import { QuickAddAction } from './quick-add.actions';

/**
 * Quick Add menu. Purely presentational: renders the actions it is given and
 * emits the chosen one. It never imports or knows about feature code; whoever
 * hosts the sheet (the tabs shell) decides what a selection does.
 */
@Component({
  selector: 'app-quick-add-sheet',
  template: `
    <fit-bottom-sheet title="Quick add" [(open)]="open">
      <ul class="grid">
        @for (action of actions(); track action.id) {
          <li>
            <button
              type="button"
              class="tile"
              [attr.aria-disabled]="!action.available"
              (click)="select(action)"
            >
              <span class="icon" aria-hidden="true"><ion-icon [name]="action.icon" /></span>
              <span class="label">{{ action.label }}</span>
              @if (!action.available) {
                <span class="status">Coming soon</span>
              }
            </button>
          </li>
        }
      </ul>
    </fit-bottom-sheet>
  `,
  styleUrl: './quick-add-sheet.component.scss',
  imports: [IonIcon, BottomSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickAddSheetComponent {
  readonly actions = input.required<readonly QuickAddAction[]>();
  readonly open = model(false);
  /** Emitted for available actions only, after the sheet starts closing. */
  readonly actionSelected = output<QuickAddAction>();

  protected select(action: QuickAddAction): void {
    if (!action.available) {
      return;
    }
    this.open.set(false);
    this.actionSelected.emit(action);
  }
}
