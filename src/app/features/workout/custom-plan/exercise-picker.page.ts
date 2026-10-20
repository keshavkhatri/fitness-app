import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { IonContent, IonFooter, IonIcon, NavController } from '@ionic/angular';

import { Exercise, ExerciseCategory } from '../../../domain/workout-programming';
import {
  BottomSheetComponent,
  FitnessButtonComponent,
  FitnessIconButtonComponent,
  SegmentOption,
  SegmentedControlComponent,
} from '../../../shared/ui';
import { WorkoutArtComponent } from '../../home/components/workout-art/workout-art.component';
import { ExerciseDemoComponent } from '../components/exercise-demo.component';
import { MUSCLE_AREAS } from '../workout-content';
import { exerciseEquipment, exerciseMuscles } from '../workout-formatting';
import { CUSTOM_PLAN_EDIT_PATH, WORKOUT_PATH } from '../workout-paths';
import { exercisePhoto } from '../workout-photos';
import { CUSTOM_PLAN_COPY } from './custom-plan-content';
import { CUSTOM_PLAN_LIMITS } from '../../../domain/training-plan';
import { CustomPlanDraftService } from './custom-plan-draft.service';
import { summarize, toEditorView } from './custom-plan-editor-view-model';
import { CustomPlanHeaderComponent } from './custom-plan-header.component';
import { PlanDayExercisesComponent } from './plan-day-exercises.component';
import { ExerciseFactsComponent } from './exercise-facts.component';
import { CATEGORY_OPTIONS, ExerciseQuery, NO_QUERY, filterExercises } from './exercise-filter';

/**
 * The exercise library: search it, filter by type (Strength, Core, Mobility, Cardio), and open an
 * exercise's details (photo, equipment, muscles, form cues, demonstration).
 *
 * Without a `sessionId` it is plain browsing, which stays Free. With one (the custom plan editor's
 * route, which is Premium) it is step 2 of the plan flow for that day: add or remove exercises (Library)
 * and edit the day's sets, reps, rest and order (My Plan); Next moves to the next training day, then to
 * the review. It edits the shared draft, so the picks are kept across days.
 */
@Component({
  selector: 'app-exercise-picker',
  templateUrl: './exercise-picker.page.html',
  styleUrls: ['./exercise-picker.page.scss', './exercise-picker-list.scss', './exercise-picker-days.scss'],
  host: { class: 'fit-theme-dashboard' },
  imports: [
    IonContent,
    IonFooter,
    IonIcon,
    BottomSheetComponent,
    ExerciseDemoComponent,
    ExerciseFactsComponent,
    CustomPlanHeaderComponent,
    FitnessButtonComponent,
    FitnessIconButtonComponent,
    PlanDayExercisesComponent,
    SegmentedControlComponent,
    WorkoutArtComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExercisePickerPage {
  /** Route parameter (`/workout/plan/edit/:sessionId/add`); absent when just browsing. */
  readonly sessionId = input<string>();

  private readonly drafts = inject(CustomPlanDraftService);
  private readonly nav = inject(NavController);

  protected readonly copy = CUSTOM_PLAN_COPY.picker;
  protected readonly photo = exercisePhoto;
  protected readonly categories = CATEGORY_OPTIONS;
  protected readonly maxPerDay = CUSTOM_PLAN_LIMITS.exercisesPerDay.max;

  protected readonly query = signal<ExerciseQuery>(NO_QUERY);
  protected readonly results = computed(() => filterExercises(this.query()));
  protected readonly filtered = computed(() => {
    const q = this.query();
    return q.text !== '' || q.muscle !== null || q.equipment !== null || q.category !== null;
  });

  /** Selecting needs a draft for that day; the editor route's resource also covers a direct visit. */
  private readonly ready = resource({ params: () => ({ id: this.sessionId() }), loader: async ({ params }) => (params.id ? this.drafts.ensure() : false) });
  protected readonly selecting = computed(() => !!this.sessionId() && this.ready.hasValue() && this.ready.value() === true && !!this.day());

  /** The day being edited: the route's, then whichever day chip was picked. */
  protected readonly activeId = linkedSignal(() => this.sessionId() ?? null);
  private readonly day = computed(() => this.drafts.draft()?.find((d) => d.sessionId === this.activeId()) ?? null);
  /** The editor's view of the whole draft (this day's rows and problems, and whether it can be saved). */
  private readonly editorView = computed(() => {
    const plan = this.drafts.base();
    const draft = this.drafts.draft();
    return plan && draft ? toEditorView(plan, draft, this.drafts.catalog) : null;
  });
  protected readonly dayView = computed(() => this.editorView()?.days.find((d) => d.sessionId === this.activeId()) ?? null);
  /** Every training day, for the chips and the details sheet's "also add to". */
  protected readonly days = computed(() => this.editorView()?.days ?? []);
  private readonly activeIndex = computed(() => this.days().findIndex((d) => d.sessionId === this.activeId()));
  /** The footer action: the next training day, or the review after the last one. */
  protected readonly nextLabel = computed(() => {
    const following = this.days()[this.activeIndex() + 1];
    return following ? this.copy.nextDay(following.heading.split(' – ')[0]) : this.copy.toReview;
  });
  protected readonly dayHeading = computed(() => this.dayView()?.heading ?? '');
  protected readonly inDayCount = computed(() => this.day()?.exercises.length ?? 0);
  protected readonly dayFull = computed(() => this.inDayCount() >= this.maxPerDay);

  /** In a plan day: the whole library, or only what is in the day already. */
  protected readonly view = signal<'library' | 'day'>('library');
  protected readonly viewOptions = computed<readonly SegmentOption<'library' | 'day'>[]>(() => [
    { value: 'library', label: this.copy.libraryTab },
    { value: 'day', label: this.copy.myPlanTab(this.inDayCount()) },
  ]);
  protected readonly showingDay = computed(() => this.selecting() && this.view() === 'day');

  protected readonly detail = signal<Exercise | null>(null);
  protected readonly detailOpen = computed(() => this.detail() !== null);

  protected setText(text: string): void {
    this.query.update((q) => ({ ...q, text }));
  }

  protected setCategory(category: ExerciseCategory | null): void {
    this.query.update((q) => ({ ...q, category }));
  }

  protected clear(): void {
    this.query.set(NO_QUERY);
  }

  /** "Legs • Barbell, rack": its first body area and what it needs. */
  protected lineOf(exercise: Exercise): string {
    const area = MUSCLE_AREAS[exercise.primaryMuscles[0]];
    return [area, exerciseEquipment(exercise)].filter(Boolean).join(' • ');
  }

  /** The details photo's caption: "Quads · Glutes • Strength". */
  protected tagsOf(exercise: Exercise): string {
    return [exerciseMuscles(exercise).join(' · '), ...exercise.categories.map((c) => this.copy.categories[c])].join(' • ');
  }

  /** The sets, reps and rest it has in this day, or would be added with; null when just browsing. */
  protected prescriptionOf(exercise: Exercise): { readonly text: string; readonly inDay: boolean } | null {
    const id = this.activeId();
    const found = id && this.selecting() ? this.drafts.prescriptionFor(id, exercise) : null;
    return found ? { text: summarize(found.exercise, exercise.measurement === 'time'), inDay: found.inDay } : null;
  }

  protected selected(exercise: Exercise): boolean {
    const id = this.activeId();
    return !!id && this.drafts.has(id, exercise.id);
  }

  protected toggle(exercise: Exercise): void {
    const id = this.activeId();
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
    void this.nav.navigateBack(this.selecting() ? CUSTOM_PLAN_EDIT_PATH : WORKOUT_PATH);
  }

  /** A day chip: edit that day here (the picks of every day are kept in the shared draft). */
  protected showDay(sessionId: string): void {
    this.activeId.set(sessionId);
    this.view.set('library');
  }

  /** Whether an exercise is in a given day (the details sheet's day list). */
  protected inDay(sessionId: string, exercise: Exercise): boolean {
    return this.drafts.has(sessionId, exercise.id);
  }

  /** The details sheet's day list: add to, or remove from, any training day. */
  protected toggleIn(sessionId: string, exercise: Exercise): void {
    if (this.drafts.has(sessionId, exercise.id)) {
      this.drafts.remove(sessionId, exercise.id);
    } else if ((this.drafts.draft()?.find((d) => d.sessionId === sessionId)?.exercises.length ?? 0) < this.maxPerDay) {
      this.drafts.add(sessionId, exercise);
    }
  }

  /** Header Back: step 1 (the training days). */
  protected backToBasics(): void {
    void this.nav.navigateBack(CUSTOM_PLAN_EDIT_PATH);
  }

  /** Next: the next training day's exercises, or the review after the last one. */
  protected next(): void {
    const following = this.days()[this.activeIndex() + 1];
    if (following) {
      this.showDay(following.sessionId);
    } else {
      void this.nav.navigateBack(CUSTOM_PLAN_EDIT_PATH, { queryParams: { step: 'review' } });
    }
  }

  /** Header Save: the review, which saves (or lists what to fix first). */
  protected saveFromHeader(): void {
    void this.nav.navigateBack(CUSTOM_PLAN_EDIT_PATH, { queryParams: { step: 'review' } });
  }
}
