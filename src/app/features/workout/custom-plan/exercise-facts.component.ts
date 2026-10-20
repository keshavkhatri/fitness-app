import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { IonIcon } from '@ionic/angular';

import { Exercise, exerciseGuidance } from '../../../domain/workout-programming';
import { MUSCLE_LABELS } from '../workout-content';
import { exerciseEquipment, exerciseMuscles } from '../workout-formatting';

/**
 * An exercise's details as the mockup's icon rows: equipment, muscles (and what else it works), a
 * description built from its form and breathing cues (the same words as its guide sheet), and, in a plan
 * day, the sets, reps and rest it has or would be added with.
 */
@Component({
  selector: 'app-exercise-facts',
  template: `
    <dl class="facts" data-testid="exercise-facts">
      <div class="fact">
        <dt><span class="icon" aria-hidden="true"><ion-icon name="barbell-outline" /></span>Equipment</dt>
        <dd>{{ equipment() }}</dd>
      </div>
      <div class="fact">
        <dt><span class="icon" aria-hidden="true"><ion-icon name="body-outline" /></span>Muscles</dt>
        <dd>
          {{ muscles() }}
          @if (secondary(); as also) {
            <span class="note">Also works {{ also }}</span>
          }
        </dd>
      </div>
      @if (guidance(); as g) {
        <div class="fact" data-testid="exercise-description">
          <dt><span class="icon" aria-hidden="true"><ion-icon name="document-text-outline" /></span>Description</dt>
          <dd>
            {{ g.cues.join('. ') }}.
            <span class="note">{{ g.breathing }}.</span>
          </dd>
        </div>
      }
    </dl>
    @if (prescription(); as p) {
      <section class="suggested" data-testid="exercise-prescription">
        <h3>{{ inDay() ? 'In your plan' : 'Suggested Sets & Reps' }}</h3>
        <p>{{ p }}</p>
        <p class="note">You can change it in your plan.</p>
      </section>
    }
  `,
  styleUrl: './exercise-facts.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExerciseFactsComponent {
  readonly exercise = input.required<Exercise>();
  /** "4 sets · 6–10 reps · 120 sec rest", or null outside a plan day. */
  readonly prescription = input<string | null>(null);
  /** Whether the prescription is the exercise's current one in the day (not the one it would start with). */
  readonly inDay = input(false);

  protected readonly muscles = computed(() => exerciseMuscles(this.exercise()).join(' · '));
  protected readonly secondary = computed(() => this.exercise().secondaryMuscles.map((m) => MUSCLE_LABELS[m]).join(' · ') || null);
  protected readonly equipment = computed(() => exerciseEquipment(this.exercise()) ?? '');
  protected readonly guidance = computed(() => exerciseGuidance(this.exercise().id));
}
