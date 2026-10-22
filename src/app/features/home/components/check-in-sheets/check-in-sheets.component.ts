import { ChangeDetectionStrategy, Component, effect, input, model, output, signal } from '@angular/core';

import { DEFAULT_STEP_GOAL, RecoveryLevel, STEPS_RANGE, WATER_GLASS_ML, WATER_RANGE_ML } from '../../../../domain/daily-check-in';
import { BottomSheetComponent, ChoiceGroupComponent, ChoiceOption, FitnessButtonComponent, TextFieldComponent } from '../../../../shared/ui';
import { RECOVERY_OPTIONS } from '../../home-today';

const NUMBER = new Intl.NumberFormat('en-US');
const LITRES = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

const RECOVERY_CHOICES: readonly ChoiceOption<RecoveryLevel>[] = RECOVERY_OPTIONS.map((o) => ({
  ...o,
  description: { poor: 'Sore or drained', fair: 'A bit tired', good: 'Ready to train', great: 'Fresh and strong' }[o.value],
}));

/** Parses "8,200" / "8200"; null when not a whole number in range. */
export function parseSteps(text: string): number | null {
  const cleaned = text.replace(/[\s,.]/g, '');
  if (!/^\d+$/.test(cleaned)) {
    return null;
  }
  const steps = Number(cleaned);
  return steps >= STEPS_RANGE.min && steps <= STEPS_RANGE.max ? steps : null;
}

/**
 * Home's daily check-ins, as sheets: steps (typed in; no health-app
 * connection yet), how recovered the user feels, and water drunk. The page saves.
 */
@Component({
  selector: 'app-check-in-sheets',
  template: `
    <fit-bottom-sheet title="Log steps" [description]="stepsDescription" screenTheme="dashboard" [(open)]="stepsOpen">
      <form class="form" novalidate (submit)="$event.preventDefault(); submitSteps()">
        <fit-text-field
          label="Steps today"
          suffix="steps"
          inputMode="numeric"
          enterKeyHint="done"
          [maxLength]="7"
          [value]="stepsText()"
          (valueChange)="stepsText.set($event); stepsError.set(null)"
          [error]="stepsError() ?? saveError()"
          [invalid]="!!stepsError()"
        />
        <button fit-button type="submit" size="lg" block [loading]="saving()" [disabled]="saving()">Save steps</button>
      </form>
    </fit-bottom-sheet>

    <fit-bottom-sheet title="How do you feel?" description="Your recovery today, as you feel it." screenTheme="dashboard" [(open)]="recoveryOpen">
      <span id="recovery-legend" class="visually-hidden">Recovery today</span>
      <fit-choice-group
        name="recovery-level"
        labelledBy="recovery-legend"
        layout="grid"
        [columns]="2"
        [options]="recoveryChoices"
        [selected]="recovery() ? [recovery()!] : []"
        (optionToggled)="saveRecovery.emit($event)"
      />
      @if (saveError(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
    </fit-bottom-sheet>

    <fit-bottom-sheet title="Water today" [description]="'Your goal is ' + litres(waterGoal()) + ' a day.'" screenTheme="dashboard" [(open)]="waterOpen">
      <div class="water">
        <p class="water-amount" aria-live="polite" data-testid="water-sheet-amount">
          <span class="water-value">{{ litres(water()) }}</span>&ngsp;<span class="water-goal">of {{ litres(waterGoal()) }}</span>
        </p>
        <div class="water-actions">
          <button fit-button type="button" variant="secondary" data-testid="water-sheet-less" [disabled]="saving() || water() < glass" (click)="saveWater.emit(water() - glass)">
            − {{ glass }} ml
          </button>
          <button fit-button type="button" data-testid="water-sheet-more" [disabled]="saving() || water() + glass > maxWater" (click)="saveWater.emit(water() + glass)">
            + {{ glass }} ml
          </button>
          <button fit-button type="button" variant="secondary" data-testid="water-sheet-bottle" [disabled]="saving() || water() + 2 * glass > maxWater" (click)="saveWater.emit(water() + 2 * glass)">
            + {{ 2 * glass }} ml
          </button>
        </div>
        @if (saveError(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      </div>
    </fit-bottom-sheet>
  `,
  styleUrl: './check-in-sheets.component.scss',
  imports: [BottomSheetComponent, ChoiceGroupComponent, FitnessButtonComponent, TextFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckInSheetsComponent {
  readonly stepsOpen = model(false);
  readonly recoveryOpen = model(false);
  /** Today's saved values, to prefill. */
  readonly steps = input<number | null>(null);
  readonly recovery = input<RecoveryLevel | null>(null);
  readonly saving = input(false);
  /** Shown when the page couldn't save. */
  readonly saveError = input<string | null>(null);

  readonly saveSteps = output<number>();
  readonly saveRecovery = output<RecoveryLevel>();

  readonly waterOpen = model(false);
  /** Today's water and the daily goal, in ml. */
  readonly water = input(0);
  readonly waterGoal = input(3_000);
  /** The new total for today (ml); the sheet stays open. */
  readonly saveWater = output<number>();
  protected readonly glass = WATER_GLASS_ML;
  protected readonly maxWater = WATER_RANGE_ML.max;
  protected readonly litres = (ml: number) => `${LITRES.format(ml / 1000)} L`;

  protected readonly stepsDescription = `Your goal is ${NUMBER.format(DEFAULT_STEP_GOAL)} steps a day.`;
  protected readonly recoveryChoices = RECOVERY_CHOICES;
  protected readonly stepsText = signal('');
  protected readonly stepsError = signal<string | null>(null);

  constructor() {
    // Prefill each time the sheet opens.
    effect(() => {
      if (this.stepsOpen()) {
        const steps = this.steps();
        this.stepsText.set(steps === null ? '' : String(steps));
        this.stepsError.set(null);
      }
    });
  }

  protected submitSteps(): void {
    const steps = parseSteps(this.stepsText());
    if (steps === null) {
      this.stepsError.set(`Enter a whole number from 0 to ${NUMBER.format(STEPS_RANGE.max)}.`);
      return;
    }
    this.saveSteps.emit(steps);
  }
}
