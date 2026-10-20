import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';

import { FitnessIconButtonComponent, TextFieldComponent } from '../../../shared/ui';
import { WorkoutArtComponent } from '../../home/components/workout-art/workout-art.component';
import { exercisePhoto } from '../workout-photos';
import { CUSTOM_PLAN_COPY } from './custom-plan-content';
import { PrescriptionField } from './custom-plan-draft';
import { CustomPlanDraftService } from './custom-plan-draft.service';
import { EditorDayView } from './custom-plan-editor-view-model';

/**
 * One plan day's exercises in order (the picker's "My Plan" tab): photo, name and sets/reps/rest, which
 * open for editing; move up or down; remove. Edits change the shared draft only.
 */
@Component({
  selector: 'app-plan-day-exercises',
  template: `
    @let d = day();
    <ol class="exercises">
      @for (exercise of d.exercises; track exercise.exerciseId) {
        @let expanded = isOpen(exercise.exerciseId);
        <li class="exercise" data-testid="editor-exercise">
          <div class="row">
            <span class="thumb" aria-hidden="true"><app-workout-art [seed]="exercise.exerciseId" [photo]="photo(exercise.exerciseId)" /></span>
            <button
              type="button"
              class="info"
              [attr.aria-expanded]="expanded"
              [attr.aria-label]="copy.editSets(exercise.name)"
              data-testid="editor-exercise-toggle"
              (click)="toggle(exercise.exerciseId)"
            >
              <span class="name"><span class="order">{{ exercise.order }}.</span> {{ exercise.name }}</span>
              <span class="summary" [class.invalid]="exercise.errors.sets || exercise.errors.repsMin || exercise.errors.repsMax || exercise.errors.seconds || exercise.errors.rest">{{ exercise.summary }}</span>
            </button>
            <div class="actions">
              <button fit-icon-button type="button" icon="arrow-up" [disabled]="exercise.first" [attr.aria-label]="copy.moveUp(exercise.name)" data-testid="editor-up" (click)="drafts.move(d.sessionId, exercise.exerciseId, -1)"></button>
              <button fit-icon-button type="button" icon="arrow-down" [disabled]="exercise.last" [attr.aria-label]="copy.moveDown(exercise.name)" data-testid="editor-down" (click)="drafts.move(d.sessionId, exercise.exerciseId, 1)"></button>
              <button fit-icon-button type="button" icon="trash-outline" [attr.aria-label]="copy.remove(exercise.name)" data-testid="editor-remove" (click)="drafts.remove(d.sessionId, exercise.exerciseId)"></button>
            </div>
          </div>

          @if (expanded) {
            <div class="fields" data-testid="editor-fields">
              <fit-text-field [label]="copy.sets" inputMode="numeric" [maxLength]="2" [value]="fieldValue(exercise.exerciseId, 'sets')" [error]="exercise.errors.sets ?? null" data-testid="field-sets" (valueChange)="edit(exercise.exerciseId, 'sets', $event)" />
              @if (exercise.timed) {
                <fit-text-field [label]="copy.seconds" [suffix]="copy.unitSeconds" inputMode="numeric" [maxLength]="3" [value]="fieldValue(exercise.exerciseId, 'seconds')" [error]="exercise.errors.seconds ?? null" data-testid="field-seconds" (valueChange)="edit(exercise.exerciseId, 'seconds', $event)" />
              } @else {
                <fit-text-field [label]="copy.repsMin" inputMode="numeric" [maxLength]="3" [value]="fieldValue(exercise.exerciseId, 'repsMin')" [error]="exercise.errors.repsMin ?? null" data-testid="field-reps-min" (valueChange)="edit(exercise.exerciseId, 'repsMin', $event)" />
                <fit-text-field [label]="copy.repsMax" inputMode="numeric" [maxLength]="3" [value]="fieldValue(exercise.exerciseId, 'repsMax')" [error]="exercise.errors.repsMax ?? null" data-testid="field-reps-max" (valueChange)="edit(exercise.exerciseId, 'repsMax', $event)" />
              }
              <fit-text-field [label]="copy.rest" [suffix]="copy.unitSeconds" inputMode="numeric" enterKeyHint="done" [maxLength]="3" [value]="fieldValue(exercise.exerciseId, 'rest')" [error]="exercise.errors.rest ?? null" data-testid="field-rest" (valueChange)="edit(exercise.exerciseId, 'rest', $event)" />
            </div>
          }
        </li>
      }
    </ol>
  `,
  styles: `
    @use 'mixins' as fx;

    .exercises {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .exercise {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-3) 0;

      & + & {
        border-top: var(--border-hairline) solid var(--color-border);
      }
    }

    .row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .thumb {
      position: relative;
      flex: none;
      width: 52px;
      height: 52px;
      overflow: hidden;
      border-radius: var(--radius-md);
    }

    .info {
      @include fx.button-reset;
      @include fx.focus-ring;

      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      text-align: start;
    }

    .name {
      @include fx.text(body-sm, semibold);
    }

    .order {
      color: var(--color-text-secondary);
    }

    .summary {
      @include fx.text(caption);
      color: var(--color-text-secondary);
    }

    .summary.invalid {
      color: var(--color-danger);
    }

    .actions {
      display: flex;
      flex: none;
      margin-inline-end: calc(-1 * var(--space-2));
    }

    .fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
      gap: var(--space-3);
    }
  `,
  imports: [FitnessIconButtonComponent, TextFieldComponent, WorkoutArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanDayExercisesComponent {
  readonly day = input.required<EditorDayView>();

  protected readonly drafts = inject(CustomPlanDraftService);
  protected readonly copy = CUSTOM_PLAN_COPY.editor;
  protected readonly photo = exercisePhoto;

  /** Exercises whose fields are open. UI state only. */
  private readonly open = signal<ReadonlySet<string>>(new Set());

  protected isOpen(exerciseId: string): boolean {
    return this.open().has(exerciseId);
  }

  protected toggle(exerciseId: string): void {
    this.open.update((set) => {
      const next = new Set(set);
      if (!next.delete(exerciseId)) {
        next.add(exerciseId);
      }
      return next;
    });
  }

  protected fieldValue(exerciseId: string, field: PrescriptionField): string {
    const sessionId = this.day().sessionId;
    return this.drafts.draft()?.find((d) => d.sessionId === sessionId)?.exercises.find((e) => e.exerciseId === exerciseId)?.[field] ?? '';
  }

  protected edit(exerciseId: string, field: PrescriptionField, value: string): void {
    this.drafts.edit(this.day().sessionId, exerciseId, field, value);
  }
}
