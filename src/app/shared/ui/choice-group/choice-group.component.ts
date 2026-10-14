import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, input, output, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';

export interface ChoiceOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
  readonly icon?: string;
  /** A picture leading the card (list layout); decorative. */
  readonly media?: ChoiceMedia;
}

/**
 * A photo, or while none ships (`src: null`) a drawn placeholder: the icon
 * on a dark tile. Paths are local assets; never hotlinked.
 */
export interface ChoiceMedia {
  readonly src: string | null;
  readonly icon: string;
}

/** circles: one row of round numbered options (e.g. days per week). */
export type ChoiceGroupLayout = 'list' | 'grid' | 'chips' | 'circles';

/**
 * Selectable option cards backed by native radios (single) or checkboxes
 * (multiple), so keyboard and screen-reader semantics come from the platform.
 *
 * Presentational only: it reports which option was activated via
 * `optionToggled`; the parent owns the selection and any rules (exclusivity,
 * dependencies) and passes the result back through `selected`.
 * Selection is shown with a check mark and border, not color alone.
 */
@Component({
  selector: 'fit-choice-group',
  template: `
    <div
      #group
      class="group"
      [attr.role]="multiple() ? 'group' : 'radiogroup'"
      [attr.aria-labelledby]="labelledBy()"
      [attr.aria-describedby]="describedBy()"
      [attr.aria-invalid]="invalid() ? 'true' : null"
      [attr.data-layout]="layout()"
      [style.--columns]="columns()"
    >
      @for (option of options(); track option.value) {
        @let checked = selected().includes(option.value);
        <label class="option" [class.selected]="checked">
          <input
            class="native"
            [type]="multiple() ? 'checkbox' : 'radio'"
            [name]="name()"
            [checked]="checked"
            (change)="optionToggled.emit(option.value)"
          />
          @if (option.media; as media) {
            <span class="media" aria-hidden="true">
              @if (media.src) {
                <img [src]="media.src" alt="" loading="lazy" />
              } @else {
                <ion-icon [name]="media.icon" />
              }
            </span>
          } @else if (option.icon) {
            <span class="icon" aria-hidden="true"><ion-icon [name]="option.icon" /></span>
          }
          <span class="text">
            <span class="title">{{ option.label }}</span>
            @if (option.description) {
              <span class="description">{{ option.description }}</span>
            }
          </span>
          <span class="indicator" aria-hidden="true">
            @if (checked) {
              <ion-icon name="checkmark" />
            }
          </span>
        </label>
      }
    </div>
  `,
  styleUrls: ['./choice-group.component.scss', './choice-group-extras.scss'],
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-mode]': 'multiple() ? "multiple" : "single"' },
})
export class ChoiceGroupComponent<T extends string | number> {
  readonly options = input.required<readonly ChoiceOption<T>[]>();
  readonly selected = input.required<readonly T[]>();
  /** Native input group name; unique per screen. */
  readonly name = input.required<string>();
  /** Id of the visible question heading that labels the group. */
  readonly labelledBy = input.required<string>();
  readonly describedBy = input<string | null>(null);
  readonly multiple = input(false, { transform: booleanAttribute });
  readonly invalid = input(false, { transform: booleanAttribute });
  readonly layout = input<ChoiceGroupLayout>('list');
  readonly columns = input(2);

  readonly optionToggled = output<T>();

  private readonly group = viewChild.required<ElementRef<HTMLElement>>('group');

  /** Focuses the selected option, or the first one. */
  focus(): void {
    const inputs = Array.from(this.group().nativeElement.querySelectorAll<HTMLInputElement>('input'));
    (inputs.find((i) => i.checked) ?? inputs[0])?.focus();
  }
}
