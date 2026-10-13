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
 * The current exercise's sets as rows: a set badge, one box per recorded
 * value (weight + reps, reps, or seconds) and a round check per set.
 * - current (the next set to do): highlighted, filled lime badge;
 * - upcoming: plain boxes, still editable;
 * - completed: a check badge, the recorded values, a filled check that undoes
 *   the set (its values go back into the boxes to edit);
 * - skipped: dashes and an undo control.
 * Status is always text or an icon as well as colour. Presentational: values
 * come from the page.
 */
@Component({
  selector: 'app-set-logger',
  template: `
    @let ex = exercise();
    <!-- Weight gets a little more room than reps, as in the design. -->
    <div class="table" [style.--field-columns]="ex.fields.length === 2 ? 'minmax(0, 1.13fr) minmax(0, 1fr)' : 'minmax(0, 1fr)'">
      <div class="head" aria-hidden="true">
        <span>{{ copy.columns.set }}</span>
        @for (field of ex.fields; track field.key) {
          <span>{{ field.label }}</span>
        }
        <span></span>
      </div>
      <ol class="rows">
        @for (row of ex.sets; track row.index) {
          <li
            class="row"
            data-testid="set-row"
            [attr.data-status]="row.status"
            [attr.aria-current]="row.index === ex.nextPendingSet ? 'step' : null"
            [class.current]="row.index === ex.nextPendingSet"
          >
            <span class="set" aria-hidden="true">
              @switch (row.status) {
                @case ('completed') {
                  <span class="tick"><ion-icon name="checkmark" /></span>
                  <span class="number">{{ row.setNumber }}</span>
                }
                @case ('skipped') {
                  <span class="badge"><ion-icon name="remove" /></span>
                }
                @default {
                  <span class="badge">{{ row.setNumber }}</span>
                }
              }
            </span>
            @if (row.index === ex.nextPendingSet) {
              <span class="visually-hidden">{{ copy.currentSet }}.&ngsp;</span>
            }
            @switch (row.status) {
              @case ('pending') {
                @for (field of ex.fields; track field.key) {
                  <input
                    class="box"
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
                    (focus)="select($event)"
                    (keydown.enter)="complete.emit(row.index)"
                  />
                }
              }
              @case ('completed') {
                <span class="result" data-testid="set-result">
                  <span class="visually-hidden">{{ copy.done }}: {{ row.valuesText }}</span>
                  @for (field of ex.fields; track field.key) {
                    <span class="box value" aria-hidden="true">{{ row.values[field.key] }}</span>
                  }
                </span>
              }
              @default {
                <span class="result" data-testid="set-result">
                  <span class="visually-hidden">{{ copy.skipped }}</span>
                  @for (field of ex.fields; track field.key) {
                    <span class="box value muted" aria-hidden="true">–</span>
                  }
                </span>
              }
            }
            <button
              type="button"
              class="check"
              data-testid="set-action"
              [attr.aria-label]="row.actionLabel"
              (click)="row.status === 'pending' ? complete.emit(row.index) : undo.emit(row.index)"
            >
              <span class="circle" aria-hidden="true">
                @if (row.status === 'completed') {
                  <ion-icon name="checkmark" />
                } @else if (row.status === 'skipped') {
                  <ion-icon name="arrow-undo-outline" />
                }
              </span>
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

  /** Tapping a number selects it, so the new value replaces it without deleting first. */
  protected select(event: Event): void {
    (event.target as HTMLInputElement).select();
  }
}
