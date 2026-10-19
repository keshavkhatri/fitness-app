import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Exercise } from '../../../domain/workout-programming';
import { MUSCLE_LABELS } from '../workout-content';
import { exerciseEquipment, exerciseMuscles } from '../workout-formatting';

/**
 * What the catalog actually knows about an exercise, as labelled rows: its muscles, equipment and kind of
 * movement, and (in a plan day) the sets, reps and rest it has or would be added with. Nothing is made up:
 * the catalog has no written instructions, so none are shown.
 */
@Component({
  selector: 'app-exercise-facts',
  template: `
    <dl class="facts" data-testid="exercise-facts">
      <div class="fact">
        <dt>Muscles</dt>
        <dd>{{ muscles() }}</dd>
      </div>
      @if (secondary(); as also) {
        <div class="fact">
          <dt>Also works</dt>
          <dd>{{ also }}</dd>
        </div>
      }
      <div class="fact">
        <dt>Equipment</dt>
        <dd>{{ equipment() }}</dd>
      </div>
      <div class="fact">
        <dt>Movement</dt>
        <dd>{{ movement() }}</dd>
      </div>
      @if (prescription(); as p) {
        <div class="fact" data-testid="exercise-prescription">
          <dt>{{ inDay() ? 'In this day' : 'When added' }}</dt>
          <dd>{{ p }}<span class="note">You can change it in your plan.</span></dd>
        </div>
      }
    </dl>
  `,
  styleUrl: './exercise-facts.component.scss',
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
  protected readonly movement = computed(() => {
    const e = this.exercise();
    return [
      e.mechanics === 'compound' ? 'Compound' : 'Isolation',
      e.laterality === 'unilateral' ? 'One side at a time' : null,
      e.measurement === 'time' ? 'Timed' : null,
    ]
      .filter(Boolean)
      .join(' · ');
  });
}
