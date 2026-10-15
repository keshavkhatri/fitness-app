import { ChangeDetectionStrategy, Component, effect, input, model, output, signal } from '@angular/core';

import { NAME_MAX_LENGTH, UserIdentity } from '../../core/identity/user-identity.service';
import { BottomSheetComponent, FitnessAvatarComponent, FitnessButtonComponent, TextFieldComponent } from '../../shared/ui';
import { PHOTO_TYPES, resizePhoto } from './photo-resize';

/**
 * Edit the name Home greets the user with, and their avatar photo. The photo
 * is resized on the device before it is saved; nothing is uploaded.
 */
@Component({
  selector: 'app-identity-sheet',
  template: `
    <fit-bottom-sheet title="Name and photo" description="Used for your greeting and avatar. Stays on this device." screenTheme="dashboard" [(open)]="open">
      <form class="form" novalidate (submit)="$event.preventDefault(); submit()">
        <div class="photo-row">
          <fit-avatar [name]="name()" [photo]="photo()" [size]="72" />
          <div class="photo-actions">
            <label class="photo-pick">
              <input class="visually-hidden" type="file" [accept]="accept" data-testid="identity-photo-input" (change)="pick($event)" />
              {{ photo() ? 'Change photo' : 'Add photo' }}
            </label>
            @if (photo()) {
              <button type="button" class="photo-remove" (click)="photo.set(null)">Remove photo</button>
            }
          </div>
        </div>
        @if (photoError(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
        <fit-text-field
          label="Name"
          autocomplete="given-name"
          enterKeyHint="done"
          [maxLength]="maxLength"
          [value]="name()"
          (valueChange)="name.set($event)"
          [error]="saveError()"
        />
        <button fit-button type="submit" size="lg" block [loading]="saving()" [disabled]="saving()">Save</button>
      </form>
    </fit-bottom-sheet>
  `,
  styleUrl: './identity-sheet.component.scss',
  imports: [BottomSheetComponent, FitnessAvatarComponent, FitnessButtonComponent, TextFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdentitySheetComponent {
  readonly open = model(false);
  readonly identity = input.required<UserIdentity>();
  readonly saving = input(false);
  readonly saveError = input<string | null>(null);
  readonly save = output<UserIdentity>();

  protected readonly accept = PHOTO_TYPES.join(',');
  protected readonly maxLength = NAME_MAX_LENGTH;
  protected readonly name = signal('');
  protected readonly photo = signal<string | null>(null);
  protected readonly photoError = signal<string | null>(null);

  constructor() {
    // Start from the saved values each time the sheet opens.
    effect(() => {
      if (this.open()) {
        const saved = this.identity();
        this.name.set(saved.name ?? '');
        this.photo.set(saved.photo);
        this.photoError.set(null);
      }
    });
  }

  protected async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.photoError.set(null);
    try {
      this.photo.set(await resizePhoto(file));
    } catch {
      this.photoError.set('Choose a JPEG, PNG or WEBP image.');
    }
  }

  protected submit(): void {
    this.save.emit({ name: this.name(), photo: this.photo() });
  }
}
