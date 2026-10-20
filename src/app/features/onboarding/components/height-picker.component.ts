import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { BodyHeight, UnitSystem } from '../../../domain/fitness-profile';
import { RulerComponent, SegmentOption, SegmentedControlComponent, TextFieldComponent } from '../../../shared/ui';
import { HeightTextInput, heightText, validateHeightInput } from '../validation/onboarding-validation';
import { feetInchesLabel, heightFromScale, heightOnScale, heightScale, spokenHeight } from './body-scales';

const UNIT_OPTIONS: readonly SegmentOption<UnitSystem>[] = [
  { value: 'metric', label: 'cm' },
  { value: 'imperial', label: 'ft in' },
];

/**
 * Height on a vertical ruler (higher is up), with a unit switch and an
 * "Enter manually" fallback. The ruler and the typed fields show the same
 * canonical height: moving one updates the other.
 *
 * Presentational: the step owns the value and the unit preference.
 */
@Component({
  selector: 'app-height-picker',
  template: `
    <fit-segmented-control
      class="units"
      name="height-units"
      legend="Height units"
      variant="pills"
      [options]="unitOptions"
      [value]="unitSystem()"
      (valueChange)="unitSystemChange.emit($event)"
    />

    <div class="stage">
      <fit-ruler
        class="ruler"
        orientation="vertical"
        label="Height"
        [min]="scale().min"
        [max]="scale().max"
        [step]="scale().step"
        [pxPerStep]="26"
        [majorEvery]="metric() ? 5 : 12"
        [labelEvery]="1"
        [format]="format()"
        [valueText]="valueText()"
        [value]="onScale()"
        [attr.aria-describedby]="describedBy()"
        (valueChange)="fromRuler($event)"
      >
        <p class="readout" aria-hidden="true">
          <span class="number">{{ readout().number }}</span>
          @if (readout().unit) {
            <span class="unit">{{ readout().unit }}</span>
          }
        </p>
      </fit-ruler>

      <div class="figure" aria-hidden="true">
        <img class="figure-art" src="assets/images/onboarding/height-figure.webp" alt="" decoding="async" />
        <span class="tag">{{ readout().number }}{{ readout().unit ? ' ' + readout().unit : '' }}</span>
      </div>
    </div>

    <button type="button" class="manual-toggle" aria-controls="height-manual" [attr.aria-expanded]="manualOpen()" (click)="toggleManual()">
      {{ manualOpen() ? 'Hide manual entry' : 'Enter manually' }}
    </button>

    @if (manualOpen()) {
      <div class="manual" id="height-manual">
        @if (metric()) {
          <fit-text-field
            #firstField
            label="Height"
            suffix="cm"
            inputMode="decimal"
            enterKeyHint="done"
            [maxLength]="5"
            [value]="text().cm"
            (valueChange)="type({ cm: $event })"
            [error]="error()"
          />
        } @else {
          <div class="pair">
            <fit-text-field
              #firstField
              label="Feet"
              suffix="ft"
              inputMode="numeric"
              [maxLength]="1"
              [value]="text().feet"
              (valueChange)="type({ feet: $event })"
              [invalid]="!!error()"
              describedBy="height-manual-error"
            />
            <fit-text-field
              label="Inches"
              suffix="in"
              inputMode="decimal"
              enterKeyHint="done"
              [maxLength]="4"
              [value]="text().inches"
              (valueChange)="type({ inches: $event })"
              [invalid]="!!error()"
              describedBy="height-manual-error"
            />
          </div>
          <p class="error" id="height-manual-error" aria-live="polite">
            @if (error(); as message) {
              <ion-icon name="alert-circle-outline" aria-hidden="true" />{{ message }}
            }
          </p>
        }
      </div>
    }
  `,
  styleUrl: './body-picker.scss',
  imports: [IonIcon, RulerComponent, SegmentedControlComponent, TextFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'height' },
})
export class HeightPickerComponent {
  readonly height = input.required<BodyHeight>();
  readonly unitSystem = input.required<UnitSystem>();
  /** Ids describing the ruler (e.g. a report note). */
  readonly describedBy = input<string | null>(null);

  readonly heightChange = output<BodyHeight>();
  readonly unitSystemChange = output<UnitSystem>();

  protected readonly unitOptions = UNIT_OPTIONS;
  protected readonly metric = computed(() => this.unitSystem() === 'metric');
  protected readonly scale = computed(() => heightScale(this.unitSystem()));
  protected readonly onScale = computed(() => heightOnScale(this.height(), this.unitSystem()));
  protected readonly format = computed(() => (this.metric() ? String : feetInchesLabel));
  protected readonly valueText = computed(() => {
    const unitSystem = this.unitSystem();
    return (value: number) => spokenHeight(value, unitSystem);
  });
  protected readonly readout = computed(() =>
    this.metric() ? { number: String(this.onScale()), unit: 'cm' } : { number: feetInchesLabel(this.onScale()), unit: '' },
  );

  protected readonly manualOpen = signal(false);
  protected readonly error = signal<string | null>(null);
  /** The height last set by typing: echoing it back would rewrite what is being typed. */
  private typed: BodyHeight | null = null;
  /** The typed fields: follow the ruler, but keep the user's own text while they type. */
  protected readonly text = linkedSignal<{ height: BodyHeight; unitSystem: UnitSystem }, HeightTextInput>({
    source: () => ({ height: this.height(), unitSystem: this.unitSystem() }),
    computation: (source, previous) =>
      previous && previous.source.unitSystem === source.unitSystem && source.height === this.typed
        ? previous.value
        : heightText(source.height, source.unitSystem),
  });

  private readonly firstField = viewChild<TextFieldComponent>('firstField');

  protected fromRuler(value: number): void {
    this.typed = null;
    this.error.set(null);
    this.heightChange.emit(heightFromScale(value, this.unitSystem()));
  }

  protected toggleManual(): void {
    this.manualOpen.update((open) => !open);
    this.error.set(null);
  }

  protected type(change: Partial<HeightTextInput>): void {
    const text = { ...this.text(), ...change };
    this.text.set(text);
    const result = validateHeightInput(text);
    if (result.ok) {
      this.error.set(null);
      this.typed = result.value;
      this.heightChange.emit(result.value);
    }
  }

  /** False (with the reason shown and focus moved) while typed text isn't a valid height. */
  check(): boolean {
    if (!this.manualOpen()) {
      return true;
    }
    const result = validateHeightInput(this.text());
    this.error.set(result.ok ? null : result.errors);
    if (!result.ok) {
      this.firstField()?.focus();
    }
    return result.ok;
  }
}
