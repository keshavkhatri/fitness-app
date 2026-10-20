import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal, viewChild } from '@angular/core';

import { BodyHeight, BodyWeight, UnitSystem, weightUnitLabel } from '../../../domain/fitness-profile';
import { RulerComponent, SegmentOption, SegmentedControlComponent, TextFieldComponent } from '../../../shared/ui';
import { validateWeightInput, weightText } from '../validation/onboarding-validation';
import { bmiReference, spokenWeight, weightFromScale, weightOnScale, weightScale } from './body-scales';

const UNIT_OPTIONS: readonly SegmentOption<UnitSystem>[] = [
  { value: 'metric', label: 'kg' },
  { value: 'imperial', label: 'lb' },
];

/**
 * Weight on a horizontal ruler in 0.1 steps, with a unit switch and an
 * "Enter manually" fallback; the ruler and the typed field stay in step.
 *
 * Presentational: the step owns the value and the unit preference.
 */
@Component({
  selector: 'app-weight-picker',
  template: `
    <fit-segmented-control
      class="units"
      name="weight-units"
      legend="Weight units"
      variant="pills"
      [options]="unitOptions"
      [value]="unitSystem()"
      (valueChange)="unitSystemChange.emit($event)"
    />

    <p class="big-readout" aria-hidden="true">
      <span class="number">{{ onScale().toFixed(1) }}</span>
      <span class="unit">{{ unit() }}</span>
    </p>

    <fit-ruler
      class="ruler"
      orientation="horizontal"
      label="Weight"
      [min]="scale().min"
      [max]="scale().max"
      [step]="scale().step"
      [pxPerStep]="10"
      [majorEvery]="10"
      [labelEvery]="10"
      [valueText]="valueText()"
      [value]="onScale()"
      [attr.aria-describedby]="describedBy()"
      (valueChange)="fromRuler($event)"
    />

    @if (reference(); as bands) {
      <section class="reference" aria-labelledby="weight-reference-title" data-testid="weight-reference">
        <h2 class="reference-title" id="weight-reference-title">Visual reference</h2>
        <ul class="bands">
          @for (band of bands; track band.key) {
            <li class="band" [class.current]="band.current" [attr.aria-current]="band.current ? 'true' : null">
              <span class="band-label">{{ band.label }}</span>
              <span class="band-range">{{ band.range }}</span>
            </li>
          }
        </ul>
        <p class="reference-note">BMI ranges for your height, in {{ unit() }}. A rough guide: it doesn't tell muscle from fat.</p>
      </section>
    }

    <button type="button" class="manual-toggle" aria-controls="weight-manual" [attr.aria-expanded]="manualOpen()" (click)="toggleManual()">
      {{ manualOpen() ? 'Hide manual entry' : 'Enter manually' }}
    </button>

    @if (manualOpen()) {
      <div class="manual" id="weight-manual">
        <fit-text-field
          label="Weight"
          inputMode="decimal"
          enterKeyHint="done"
          [suffix]="unit()"
          [maxLength]="6"
          [value]="text()"
          (valueChange)="type($event)"
          [error]="error()"
        />
      </div>
    }
  `,
  styleUrls: ['./body-picker.scss', './weight-reference.scss'],
  imports: [RulerComponent, SegmentedControlComponent, TextFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'weight' },
})
export class WeightPickerComponent {
  readonly weight = input.required<BodyWeight>();
  readonly unitSystem = input.required<UnitSystem>();
  /** The height answered on the step before; the BMI reference shows only with one. */
  readonly height = input<BodyHeight | null>(null);
  /** Ids describing the ruler (e.g. a report note). */
  readonly describedBy = input<string | null>(null);

  readonly weightChange = output<BodyWeight>();
  readonly unitSystemChange = output<UnitSystem>();

  protected readonly unitOptions = UNIT_OPTIONS;
  protected readonly unit = computed(() => weightUnitLabel(this.unitSystem()));
  protected readonly scale = computed(() => weightScale(this.unitSystem()));
  protected readonly onScale = computed(() => weightOnScale(this.weight(), this.unitSystem()));
  protected readonly reference = computed(() => {
    const height = this.height();
    return height ? bmiReference(height, this.weight(), this.unitSystem()) : null;
  });
  protected readonly valueText = computed(() => {
    const unitSystem = this.unitSystem();
    return (value: number) => spokenWeight(value, unitSystem);
  });

  protected readonly manualOpen = signal(false);
  protected readonly error = signal<string | null>(null);
  /** The weight last set by typing: echoing it back would rewrite what is being typed. */
  private typed: BodyWeight | null = null;
  protected readonly text = linkedSignal<{ weight: BodyWeight; unitSystem: UnitSystem }, string>({
    source: () => ({ weight: this.weight(), unitSystem: this.unitSystem() }),
    computation: (source, previous) =>
      previous && previous.source.unitSystem === source.unitSystem && source.weight === this.typed
        ? previous.value
        : weightText(source.weight, source.unitSystem),
  });

  private readonly field = viewChild(TextFieldComponent);

  protected fromRuler(value: number): void {
    this.typed = null;
    this.error.set(null);
    this.weightChange.emit(weightFromScale(value, this.unitSystem()));
  }

  protected toggleManual(): void {
    this.manualOpen.update((open) => !open);
    this.error.set(null);
  }

  protected type(text: string): void {
    this.text.set(text);
    const result = validateWeightInput(text, this.unitSystem());
    if (result.ok) {
      this.error.set(null);
      this.typed = result.value;
      this.weightChange.emit(result.value);
    }
  }

  /** False (with the reason shown and focus moved) while typed text isn't a valid weight. */
  check(): boolean {
    if (!this.manualOpen()) {
      return true;
    }
    const result = validateWeightInput(this.text(), this.unitSystem());
    this.error.set(result.ok ? null : result.errors);
    if (!result.ok) {
      this.field()?.focus();
    }
    return result.ok;
  }
}
