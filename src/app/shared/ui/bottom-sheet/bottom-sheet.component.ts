import { ChangeDetectionStrategy, Component, input, model, viewChild } from '@angular/core';
import { IonIcon, IonModal } from '@ionic/angular';

let nextId = 0;

/**
 * Auto-height bottom sheet built on Ionic's sheet modal (focus trapping,
 * swipe-to-dismiss and backdrop handling come from Ionic).
 *
 * <fit-bottom-sheet title="Quick add" [(open)]="isOpen">…</fit-bottom-sheet>
 */
@Component({
  selector: 'fit-bottom-sheet',
  template: `
    <ion-modal
      class="bottom-sheet"
      [isOpen]="open()"
      [initialBreakpoint]="1"
      [breakpoints]="[0, 1]"
      [attr.aria-labelledby]="titleId"
      (didDismiss)="open.set(false)"
    >
      <ng-template>
        <div class="sheet">
          <header class="sheet-header">
            <h2 class="sheet-title" [id]="titleId">{{ title() }}</h2>
            <button type="button" class="close" aria-label="Close" (click)="dismiss()">
              <ion-icon name="close" aria-hidden="true" />
            </button>
          </header>
          @if (description(); as text) {
            <p class="sheet-description">{{ text }}</p>
          }
          <ng-content />
        </div>
      </ng-template>
    </ion-modal>
  `,
  styleUrl: './bottom-sheet.component.scss',
  imports: [IonModal, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BottomSheetComponent {
  readonly title = input.required<string>();
  readonly description = input<string>();
  readonly open = model(false);

  protected readonly titleId = `fit-bottom-sheet-title-${nextId++}`;
  private readonly modal = viewChild.required(IonModal);

  dismiss(): Promise<boolean> {
    return this.modal().dismiss();
  }
}
