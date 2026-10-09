import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { WORKOUT_COPY } from '../workout-content';
import { ActiveExerciseView, FieldKey, FieldView, SetRowView } from './active-workout-view-model';

export interface DraftEdit {
  readonly setIndex: number;
  readonly field: FieldKey;
  readonly value: string;
}

export interface SetError {
  readonly field: FieldKey | null;
  readonly message: string;
}

/**
 * The current exercise's sets as rows: large inputs for what the exercise
 * records (weight + reps, reps, or seconds) and one large button per set to
 * complete it (or undo a completed/skipped set). Status is shown with text and
 * an icon, never by color alone. Presentational: values come from the page.
 */
@Component({
  selector: 'app-set-logger',
  template: `
    @let ex = exercise();
    <div class="table" [style.--field-count]="ex.fields.length">
      <div class="head" aria-hidden="true">
        <span>{{ copy.columns.set }}</span>
        @for (field of ex.fields; track field.key) {
          <span>{{ field.label }}</span>
        }
        <span></span>
      </div>
      <ol class="rows">
        @for (row of ex.sets; track row.index) {
          <li class="row" data-testid="set-row" [attr.data-status]="row.status" [class.next]="row.index === ex.nextPendingSet">
            <span class="number" aria-hidden="true">{{ row.setNumber }}</span>
            @switch (row.status) {
              @case ('pending') {
                @for (field of ex.fields; track field.key) {
                  <input
                    class="input"
                    type="text"
                    autocomplete="off"
                    [attr.inputmode]="field.inputMode"
                    [attr.enterkeyhint]="'done'"
                    [attr.aria-label]="inputLabel(row, field)"
                    [attr.aria-invalid]="errorFor(row)?.field === field.key ? 'true' : null"
                    [attr.aria-describedby]="errorFor(row) ? errorId(row) : null"
                    [attr.data-field]="field.key"
                    [placeholder]="field.placeholder"
                    [value]="valueFor(row, field.key)"
                    (input)="edit(row, field.key, $event)"
                    (keydown.enter)="complete.emit(row.index)"
                  />
                }
              }
              @case ('completed') {
                <span class="result" data-testid="set-result">
                  <ion-icon name="checkmark-circle" aria-hidden="true" />
                  <span>{{ row.valuesText }}</span>
                </span>
              }
              @default {
                <span class="result skipped" data-testid="set-result">
                  <ion-icon name="remove-circle-outline" aria-hidden="true" />
                  <span>{{ copy.skipped }}</span>
                </span>
              }
            }
            <button
              type="button"
              class="action"
              data-testid="set-action"
              [attr.aria-label]="row.actionLabel"
              (click)="row.status === 'pending' ? complete.emit(row.index) : undo.emit(row.index)"
            >
              <ion-icon [name]="row.status === 'pending' ? 'checkmark' : 'arrow-undo-outline'" aria-hidden="true" />
            </button>
            @if (errorFor(row); as error) {
              <p class="error" role="alert" [id]="errorId(row)" data-testid="set-error">{{ error.message }}</p>
            }
          </li>
        }
      </ol>
    </div>
  `,
  styleUrl: './set-logger.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetLoggerComponent {
  readonly exercise = input.required<ActiveExerciseView>();
  /** Unsaved input per set index; falls back to the row's suggestion. */
  readonly drafts = input<Readonly<Record<number, Partial<Record<FieldKey, string>>>>>({});
  readonly errors = input<Readonly<Record<number, SetError>>>({});
  /** Distinguishes ids when several loggers could exist. */
  readonly idPrefix = input('set');

  readonly draftChange = output<DraftEdit>();
  readonly complete = output<number>();
  readonly undo = output<number>();

  protected readonly copy = WORKOUT_COPY.active;

  protected valueFor(row: SetRowView, field: FieldKey): string {
    return this.drafts()[row.index]?.[field] ?? row.suggestion[field];
  }

  protected errorFor(row: SetRowView): SetError | null {
    return this.errors()[row.index] ?? null;
  }

  protected errorId(row: SetRowView): string {
    return `${this.idPrefix()}-error-${row.index}`;
  }

  protected inputLabel(row: SetRowView, field: FieldView): string {
    return `${row.label}, ${field.spoken}`;
  }

  protected edit(row: SetRowView, field: FieldKey, event: Event): void {
    this.draftChange.emit({ setIndex: row.index, field, value: (event.target as HTMLInputElement).value });
  }
}
