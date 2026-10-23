import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

import { UnitSystem } from '../../../domain/fitness-profile';
import { WATER_RANGE_ML, waterGlassMl } from '../../../domain/nutrition';
import { BottomSheetComponent, FitnessButtonComponent } from '../../../shared/ui';
import { formatWater, glassLabel } from '../nutrition-water';

/** A day's water, to correct: a glass less, a glass more, or a bottle. The page saves; the sheet stays open. */
@Component({
  selector: 'app-water-sheet',
  template: `
    <fit-bottom-sheet [title]="title()" [description]="'Your goal is ' + fmt(goal()) + ' a day.'" screenTheme="dashboard" [(open)]="open">
      <div class="water">
        <p class="amount" aria-live="polite" data-testid="water-sheet-amount">
          <span class="value">{{ fmt(water()) }}</span>&ngsp;<span class="goal">of {{ fmt(goal()) }}</span>
        </p>
        <div class="actions">
          <button fit-button type="button" variant="secondary" data-testid="water-sheet-less" [disabled]="saving() || water() < glass()" (click)="save.emit(water() - glass())">
            − {{ label(1) }}
          </button>
          <button fit-button type="button" data-testid="water-sheet-more" [disabled]="saving() || water() + glass() > max" (click)="save.emit(water() + glass())">
            + {{ label(1) }}
          </button>
          <button fit-button type="button" variant="secondary" data-testid="water-sheet-bottle" [disabled]="saving() || water() + 2 * glass() > max" (click)="save.emit(water() + 2 * glass())">
            + {{ label(2) }}
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
  /** The person's units: metric pours in 250 ml, imperial in 8 fl oz. */
  readonly unit = input<UnitSystem>('metric');
  /** The day's new total (ml). */
  readonly save = output<number>();

  protected readonly glass = computed(() => waterGlassMl(this.unit()));
  protected readonly max = WATER_RANGE_ML.max;
  protected readonly fmt = (ml: number) => formatWater(ml, this.unit());
  protected readonly label = (multiple: number) => glassLabel(multiple, this.unit());
}
