import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';

import { WATER_GLASS_ML, WATER_RANGE_ML } from '../../../domain/nutrition';
import { BottomSheetComponent, FitnessButtonComponent } from '../../../shared/ui';
import { formatLitres } from '../nutrition-water';

/** A day's water, to correct: a glass less, a glass more, or a bottle. The page saves; the sheet stays open. */
@Component({
  selector: 'app-water-sheet',
  template: `
    <fit-bottom-sheet [title]="title()" [description]="'Your goal is ' + litres(goal()) + ' a day.'" screenTheme="dashboard" [(open)]="open">
      <div class="water">
        <p class="amount" aria-live="polite" data-testid="water-sheet-amount">
          <span class="value">{{ litres(water()) }}</span>&ngsp;<span class="goal">of {{ litres(goal()) }}</span>
        </p>
        <div class="actions">
          <button fit-button type="button" variant="secondary" data-testid="water-sheet-less" [disabled]="saving() || water() < glass" (click)="save.emit(water() - glass)">
            − {{ glass }} ml
          </button>
          <button fit-button type="button" data-testid="water-sheet-more" [disabled]="saving() || water() + glass > max" (click)="save.emit(water() + glass)">
            + {{ glass }} ml
          </button>
          <button fit-button type="button" variant="secondary" data-testid="water-sheet-bottle" [disabled]="saving() || water() + 2 * glass > max" (click)="save.emit(water() + 2 * glass)">
            + {{ 2 * glass }} ml
          </button>
        </div>
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      </div>
    </fit-bottom-sheet>
  `,
  styles: `
    @use 'mixins' as fx;

    .water {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding-bottom: var(--space-2);
    }

    .amount {
      @include fx.tabular-numbers;
      text-align: center;
    }

    .value {
      @include fx.text(h1, bold);
    }

    .goal {
      @include fx.text(body);
      color: var(--color-text-secondary);
    }

    .actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 6.5em), 1fr));
      gap: var(--space-2);
    }

    .error {
      @include fx.text(body-sm, medium);
      color: var(--color-danger-text);
    }
  `,
  imports: [BottomSheetComponent, FitnessButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaterSheetComponent {
  readonly open = model(false);
  readonly title = input('Water today');
  /** The day's water and the daily goal, in ml. */
  readonly water = input(0);
  readonly goal = input(3_000);
  readonly saving = input(false);
  readonly error = input<string | null>(null);
  /** The day's new total (ml). */
  readonly save = output<number>();

  protected readonly glass = WATER_GLASS_ML;
  protected readonly max = WATER_RANGE_ML.max;
  protected readonly litres = formatLitres;
}
