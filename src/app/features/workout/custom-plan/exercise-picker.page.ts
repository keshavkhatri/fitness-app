import { ChangeDetectionStrategy, Component, computed, inject, input, resource, signal } from '@angular/core';
import { IonContent, IonFooter, IonIcon, NavController } from '@ionic/angular';

import { Exercise, MuscleGroup, WorkoutPlan } from '../../../domain/workout-programming';
import { BottomSheetComponent, FitnessButtonComponent, FitnessChipComponent, FitnessIconButtonComponent } from '../../../shared/ui';
import { WorkoutArtComponent } from '../../home/components/workout-art/workout-art.component';
import { ExerciseDemoComponent } from '../components/exercise-demo.component';
import { exerciseEquipment, exerciseMuscles, sessionTitle } from '../workout-formatting';
import { WORKOUT_PATH } from '../workout-paths';
import { CUSTOM_PLAN_COPY } from './custom-plan-content';
import { CUSTOM_PLAN_LIMITS } from '../../../domain/training-plan';
import { CustomPlanDraftService } from './custom-plan-draft.service';
import { EQUIPMENT_OPTIONS, EquipmentFilter, ExerciseQuery, MUSCLE_OPTIONS, NO_QUERY, filterExercises } from './exercise-filter';

/**
 * The exercise library: search and filter the whole catalog, open an exercise's details (muscles,
 * equipment, demonstration photos), and, when opened for a plan day, add or remove it from that day.
 *
 * Without a `sessionId` it is plain browsing, which stays Free. With one (the custom plan editor's
 * route, which is Premium) it edits the shared draft, so the picks are still there when the user returns.
 */
@Component({
  selector: 'app-exercise-picker',
  templateUrl: './exercise-picker.page.html',
  styleUrl: './exercise-picker.page.scss',
  host: { class: 'fit-theme-dashboard' },
  imports: [IonContent, IonFooter, IonIcon, BottomSheetComponent, ExerciseDemoComponent, FitnessButtonComponent, FitnessChipComponent, FitnessIconButtonComponent, WorkoutArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExercisePickerPage {
  /** Route parameter (`/workout/plan/edit/:sessionId/add`); absent when just browsing. */
  readonly sessionId = input<string>();

  private readonly drafts = inject(CustomPlanDraftService);
  private readonly nav = inject(NavController);

  protected readonly copy = CUSTOM_PLAN_COPY.picker;
  protected readonly muscles = MUSCLE_OPTIONS;
  protected readonly equipment = EQUIPMENT_OPTIONS;
  protected readonly maxPerDay = CUSTOM_PLAN_LIMITS.exercisesPerDay.max;

  protected readonly query = signal<ExerciseQuery>(NO_QUERY);
  protected readonly results = computed(() => filterExercises(this.query()));
  protected readonly filtered = computed(() => {
    const q = this.query();
    return q.text !== '' || q.muscle !== null || q.equipment !== null;
  });

  /** Selecting needs a draft for that day; the editor route's resource also covers a direct visit. */
  private readonly ready = resource({ params: () => ({ id: this.sessionId() }), loader: async ({ params }) => (params.id ? this.drafts.ensure() : false) });
  protected readonly selecting = computed(() => !!this.sessionId() && this.ready.hasValue() && this.ready.value() === true && !!this.day());

  private readonly session = computed(() => {
    const id = this.sessionId();
    const plan: WorkoutPlan | null = this.drafts.base();
    const s = plan?.sessions.find((x) => x.id === id);
    return s?.kind === 'resistance' ? s : null;
  });
  private readonly day = computed(() => this.drafts.draft()?.find((d) => d.sessionId === this.sessionId()) ?? null);
  protected readonly title = computed(() => {
    const session = this.session();
    return this.selecting() && session ? this.copy.addTitle(sessionTitle(session)) : this.copy.libraryTitle;
  });
  protected readonly inDayCount = computed(() => this.day()?.exercises.length ?? 0);
  protected readonly dayFull = computed(() => this.inDayCount() >= this.maxPerDay);

  protected readonly detail = signal<Exercise | null>(null);
  protected readonly detailOpen = computed(() => this.detail() !== null);

  protected setText(text: string): void {
    this.query.update((q) => ({ ...q, text }));
  }

  protected setMuscle(value: string): void {
    this.query.update((q) => ({ ...q, muscle: (value || null) as MuscleGroup | null }));
  }

  protected setEquipment(value: string): void {
    this.query.update((q) => ({ ...q, equipment: (value || null) as EquipmentFilter | null }));
  }

  protected clear(): void {
    this.query.set(NO_QUERY);
  }

  protected musclesOf(exercise: Exercise): string {
    return exerciseMuscles(exercise).join(' · ');
  }

  /** What the exercise needs, e.g. "Barbell, bench, rack" or "Bodyweight". */
  protected equipmentOf(exercise: Exercise): string {
    return exerciseEquipment(exercise) ?? '';
  }

  protected selected(exercise: Exercise): boolean {
    const id = this.sessionId();
    return !!id && this.drafts.has(id, exercise.id);
  }

  protected toggle(exercise: Exercise): void {
    const id = this.sessionId();
    if (!id || !this.selecting()) {
      return;
    }
    if (this.drafts.has(id, exercise.id)) {
      this.drafts.remove(id, exercise.id);
    } else if (!this.dayFull()) {
      this.drafts.add(id, exercise);
    }
  }

  protected canToggle(exercise: Exercise): boolean {
    return this.selected(exercise) || !this.dayFull();
  }

  protected showDetails(exercise: Exercise): void {
    this.detail.set(exercise);
  }

  protected closeDetails(open: boolean): void {
    if (!open) {
      this.detail.set(null);
    }
  }

  protected done(): void {
    void this.nav.navigateBack(this.selecting() ? '/workout/plan/edit' : WORKOUT_PATH);
  }
}
