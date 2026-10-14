import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/**
 * - default: grey track, raised white selection (forms, settings).
 * - ink: an ink pill with the selection in lime (a screen's main switch on light screens).
 * - compact: no track; small text options, the selection on a soft pill (a card's range).
 * - inverse: a surface track with the selection in the text colour (ranges on dark screens).
 * - pills: separate pills, the selection inverted (chart metrics on dark screens).
 * - underline: tabs with a line under the selection (views of one record).
 */
export type SegmentedVariant = 'default' | 'ink' | 'compact' | 'inverse' | 'pills' | 'underline';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Read instead of a short visible label ("1M" → "Last month"). */
  spoken?: string;
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
            [attr.aria-label]="option.spoken ?? null"
            (change)="value.set(option.value)"
          />
          <span>{{ option.label }}</span>
        </label>
      }
    </fieldset>
  `,
  styleUrl: './segmented-control.component.scss',
  host: { '[attr.data-variant]': 'variant()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SegmentedControlComponent<T extends string> {
  readonly options = input.required<readonly SegmentOption<T>[]>();
  readonly value = model.required<T>();
  /** Radio group name; must be unique on the page. */
  readonly name = input.required<string>();
  /** Accessible group label. */
  readonly legend = input.required<string>();
  readonly variant = input<SegmentedVariant>('default');
}
