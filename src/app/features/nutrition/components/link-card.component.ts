import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

/** A full-width row that opens another screen: icon, title, one line of detail, chevron. */
@Component({
  selector: 'app-link-card',
  template: `
    <button type="button" class="link-card" (click)="open.emit()">
      <span class="link-icon" aria-hidden="true"><ion-icon [name]="icon()" /></span>
      <span class="link-text">
        <span class="link-title">{{ title() }}</span>&ngsp;
        <span class="link-detail">{{ detail() }}</span>
      </span>
      <ion-icon class="link-chevron" name="chevron-forward" aria-hidden="true" />
    </button>
  `,
  styleUrl: './link-card.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkCardComponent {
  readonly icon = input.required<string>();
  readonly title = input.required<string>();
  readonly detail = input.required<string>();
  readonly open = output<void>();
}
