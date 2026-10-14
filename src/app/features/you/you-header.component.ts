import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessAvatarComponent } from '../../shared/ui';
import { YouHeaderView } from './you-view-model';

/** Photo (or initials), name, and age and height when known; the photo button edits name and photo. */
@Component({
  selector: 'app-you-header',
  template: `
    <button type="button" class="avatar-button" aria-label="Edit name and photo" data-testid="identity-entry" (click)="edit.emit()">
      <fit-avatar [name]="name()" [photo]="photo()" [size]="88" />
      <span class="avatar-badge" aria-hidden="true"><ion-icon name="create-outline" /></span>
    </button>
    <p class="name" data-testid="you-name">{{ header().name ?? 'Add your name' }}</p>
    @if (header().details; as details) {
      <p class="details" data-testid="you-details">{{ details }}</p>
    }
  `,
  styleUrl: './you-header.component.scss',
  imports: [IonIcon, FitnessAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YouHeaderComponent {
  readonly name = input<string | null>(null);
  readonly photo = input<string | null>(null);
  readonly header = input.required<YouHeaderView>();
  readonly edit = output<void>();
}
