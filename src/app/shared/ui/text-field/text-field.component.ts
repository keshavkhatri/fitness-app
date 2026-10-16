import { ChangeDetectionStrategy, Component, ElementRef, computed, input, model, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';

let nextId = 0;

/**
 * Labelled single-line text input with optional unit suffix, hint and error.
 * Values are always strings; parsing/validation belongs to the caller.
 *
 * The suffix is part of the accessible name ("Weight kg"), and the error or
 * hint is linked via aria-describedby.
 *
 * `size="lg"`: one prominent value (e.g. a weight), centred in large type.
 */
@Component({
  selector: 'fit-text-field',
  template: `
    <label class="label" [id]="ids.label" [for]="ids.input">{{ label() }}</label>
    <div class="control" [class.invalid]="!!error() || invalid()">
      <input
        #input
        class="input"
        [type]="type()"
        [attr.max]="max() ?? null"
        [id]="ids.input"
        [value]="value()"
        (input)="value.set($any($event.target).value)"
        [attr.inputmode]="inputMode()"
        [attr.autocapitalize]="credential() ? 'off' : null"
        [attr.spellcheck]="credential() ? 'false' : null"
        [attr.autocomplete]="autocomplete()"
        [attr.enterkeyhint]="enterKeyHint()"
        [attr.maxlength]="maxLength() ?? null"
        [attr.aria-labelledby]="labelledBy()"
        [attr.aria-invalid]="error() || invalid() ? 'true' : null"
        [attr.aria-describedby]="ariaDescribedBy()"
      />
      @if (suffix(); as unit) {
        <span class="suffix" [id]="ids.suffix">{{ unit }}</span>
      }
    </div>
    @if (error(); as message) {
      <p class="message error" [id]="ids.message">
        <ion-icon name="alert-circle-outline" aria-hidden="true" />{{ message }}
      </p>
    } @else if (hint(); as message) {
      <p class="message" [id]="ids.message">{{ message }}</p>
    }
  `,
  styleUrl: './text-field.component.scss',
  imports: [IonIcon],
  host: { '[attr.data-size]': 'size()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextFieldComponent {
  readonly label = input.required<string>();
  readonly value = model('');
  readonly suffix = input<string>();
  readonly hint = input<string>();
  readonly error = input<string | null>();
  /** Drives the mobile keyboard: use 'numeric' for whole numbers, 'decimal' for measurements. */
  readonly inputMode = input<'text' | 'numeric' | 'decimal' | 'email'>('text');
  /** 'date' uses the platform date picker; the value is then YYYY-MM-DD. 'email' and 'password' are for sign-in. */
  readonly type = input<'text' | 'date' | 'email' | 'password'>('text');
  /** Latest allowed value (date fields, YYYY-MM-DD). */
  readonly max = input<string>();
  readonly autocomplete = input('off');
  readonly enterKeyHint = input<'next' | 'done'>('next');
  readonly maxLength = input<number>();
  /** Marks the field invalid without its own message (e.g. one shared message for feet + inches). */
  readonly invalid = input(false);
  /** Id of an external element describing this field (e.g. that shared message). */
  readonly describedBy = input<string | null>(null);
  readonly size = input<'md' | 'lg'>('md');

  protected readonly ids = (() => {
    const id = `fit-field-${nextId++}`;
    return { input: id, label: `${id}-label`, suffix: `${id}-suffix`, message: `${id}-message` };
  })();

  /** Addresses and passwords are never auto-capitalised or spell-checked. */
  protected readonly credential = computed(() => this.type() === 'email' || this.type() === 'password');

  protected readonly labelledBy = computed(() =>
    this.suffix() ? `${this.ids.label} ${this.ids.suffix}` : this.ids.label,
  );

  protected readonly ariaDescribedBy = computed(() => {
    const ids = [this.error() || this.hint() ? this.ids.message : null, this.describedBy()].filter(Boolean);
    return ids.length ? ids.join(' ') : null;
  });

  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('input');

  focus(): void {
    this.inputRef().nativeElement.focus();
  }
}
