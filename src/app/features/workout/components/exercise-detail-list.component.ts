import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { DetailExerciseView } from '../workout-detail-view-model';
import { ExerciseDemoComponent } from './exercise-demo.component';

/**
 * The full prescription of a session, in programmed order. Each prescription
 * is a small stat grid (value over label) so nothing wraps mid-phrase at
 * 320px. A demonstration, where the exercise has one, opens on request.
 */
@Component({
  selector: 'app-exercise-detail-list',
  template: `
    <ol class="exercises">
      @for (exercise of exercises(); track exercise.order) {
        <li class="exercise" data-testid="detail-exercise">
          <div class="head">
            <span class="thumb" aria-hidden="true">{{ exercise.order }}</span>
            <div class="identity">
              <h3 class="name"><span class="visually-hidden">{{ exercise.order }}. </span>{{ exercise.name }}</h3>
              @if (exercise.metadata; as metadata) {
                <p class="metadata">{{ metadata }}</p>
              }
            </div>
          </div>

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

          <app-exercise-demo [exerciseId]="exercise.exerciseId" [name]="exercise.name" />

          @if (exercise.substitution; as substitution) {
            <p class="substitution" data-testid="substitution">
              <ion-icon name="swap-horizontal-outline" aria-hidden="true" />
              <span><strong>{{ substitution.title }}.</strong> {{ substitution.message }}</span>
            </p>
          }
        </li>
      }
    </ol>
  `,
  styleUrl: './exercise-detail-list.component.scss',
  imports: [IonIcon, ExerciseDemoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExerciseDetailListComponent {
  readonly exercises = input.required<readonly DetailExerciseView[]>();
}
