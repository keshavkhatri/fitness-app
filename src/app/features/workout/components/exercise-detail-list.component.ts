import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { WorkoutArtComponent } from '../../home/components/workout-art/workout-art.component';
import { DetailExerciseView } from '../workout-detail-view-model';
import { ExerciseDemoComponent } from './exercise-demo.component';

/**
 * A session's exercises in programmed order, as compact rows (number,
 * thumbnail, name, sets and target). There is no exercise screen: a row opens
 * in place to the full prescription (sets, target, rest), the muscles and
 * equipment, a demonstration where one exists, and any substitution note.
 */
@Component({
  selector: 'app-exercise-detail-list',
  template: `
    <ol class="exercises">
      @for (exercise of exercises(); track exercise.order) {
        @let open = isOpen(exercise.order);
        <li class="exercise" [class.open]="open" data-testid="detail-exercise">
          <h3 class="heading">
            <button
              type="button"
              class="row"
              [attr.aria-expanded]="open"
              [attr.aria-controls]="'exercise-more-' + exercise.order"
              data-testid="detail-exercise-toggle"
              (click)="toggle(exercise.order)"
            >
              <span class="order" aria-hidden="true">{{ exercise.order }}</span>
              <span class="thumb" aria-hidden="true"><app-workout-art [seed]="exercise.exerciseId" /></span>
              <span class="text">
                <span class="name"><span class="visually-hidden">{{ exercise.order }}. </span>{{ exercise.name }}</span>&ngsp;
                <span class="brief">{{ exercise.brief }}</span>
              </span>
              <ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
            </button>
          </h3>

          <div class="more" [id]="'exercise-more-' + exercise.order" [hidden]="!open">
            <dl class="stats" data-testid="detail-stats">
              @for (stat of exercise.stats; track stat.label) {
                <div class="stat">
                  <dt class="label">
                    <span aria-hidden="true">{{ stat.label }}</span>
                    <span class="visually-hidden">{{ stat.spokenLabel }}</span>
                  </dt>
                  <dd class="value">{{ stat.value }}</dd>
                </div>
              }
            </dl>
            @if (exercise.metadata; as metadata) {
              <p class="metadata">{{ metadata }}</p>
            }
            @if (exercise.substitution; as substitution) {
              <p class="substitution" data-testid="substitution">
                <ion-icon name="swap-horizontal-outline" aria-hidden="true" />
                <span><strong>{{ substitution.title }}.</strong> {{ substitution.message }}</span>
              </p>
            }
            @if (open) {
              <app-exercise-demo [exerciseId]="exercise.exerciseId" [name]="exercise.name" />
            }
          </div>
        </li>
      }
    </ol>
  `,
  styleUrl: './exercise-detail-list.component.scss',
  imports: [IonIcon, ExerciseDemoComponent, WorkoutArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExerciseDetailListComponent {
  readonly exercises = input.required<readonly DetailExerciseView[]>();

  /** Rows opened by the user (UI state only). */
  private readonly opened = signal<ReadonlySet<number>>(new Set());

  protected isOpen(order: number): boolean {
    return this.opened().has(order);
  }

  protected toggle(order: number): void {
    this.opened.update((set) => {
      const next = new Set(set);
      if (!next.delete(order)) {
        next.add(order);
      }
      return next;
    });
  }
}
