import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Single-choice segmented control backed by native radio inputs, so keyboard
 * (arrow keys) and screen-reader behaviour come for free.
 *
 * <fit-segmented-control legend="Appearance" name="theme" [options]="opts" [(value)]="pref" />
 */
@Component({
  selector: 'fit-segmented-control',
  template: `
    <fieldset>
      <legend class="visually-hidden">{{ legend() }}</legend>
      @for (option of options(); track option.value) {
        <label class="segment" [class.selected]="option.value === value()">
          <input
            type="radio"
            [name]="name()"
            [value]="option.value"
            [checked]="option.value === value()"
            (change)="value.set(option.value)"
          />
          <span>{{ option.label }}</span>
        </label>
      }
    </fieldset>
  `,
  styleUrl: './segmented-control.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SegmentedControlComponent<T extends string> {
  readonly options = input.required<readonly SegmentOption<T>[]>();
  readonly value = model.required<T>();
  /** Radio group name; must be unique on the page. */
  readonly name = input.required<string>();
  /** Accessible group label. */
  readonly legend = input.required<string>();
}
