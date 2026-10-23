import { ChangeDetectionStrategy, Component, computed, effect, input, model, output, signal } from '@angular/core';

import { DEFAULT_STEP_GOAL, RecoveryLevel, STEPS_RANGE } from '../../../../domain/daily-check-in';
import { BottomSheetComponent, ChoiceGroupComponent, ChoiceOption, FitnessButtonComponent, TextFieldComponent } from '../../../../shared/ui';
import { RECOVERY_OPTIONS } from '../../home-today';

const NUMBER = new Intl.NumberFormat('en-US');

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
 * Home's two daily check-ins, as sheets: steps (typed in; no health-app
 * connection yet) and how recovered the user feels. The page saves.
 */
@Component({
  selector: 'app-check-in-sheets',
  template: `
    <fit-bottom-sheet title="Log steps" [description]="stepsDescription()" screenTheme="dashboard" [(open)]="stepsOpen">
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
  /** The person's daily step goal. */
  readonly stepGoal = input(DEFAULT_STEP_GOAL);
  /** The phone counts steps (Health Connect): a typed number is replaced by the phone's total for the day. */
  readonly stepsFromPhone = input(false);
  readonly recovery = input<RecoveryLevel | null>(null);
  readonly saving = input(false);
  /** Shown when the page couldn't save. */
  readonly saveError = input<string | null>(null);

  readonly saveSteps = output<number>();
  readonly saveRecovery = output<RecoveryLevel>();


  protected readonly stepsDescription = computed(
    () =>
      `Your goal is ${NUMBER.format(this.stepGoal())} steps a day.` +
      (this.stepsFromPhone() ? " Your phone is counting your steps, so its total replaces a number typed here." : ''),
  );
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
