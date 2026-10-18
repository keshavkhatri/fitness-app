import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { IonContent, IonFooter, IonIcon, NavController } from '@ionic/angular';

import { WorkoutPlanService } from '../../../core/workout/workout-plan.service';
import {
  BottomSheetComponent,
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessIconButtonComponent,
  LoadingSkeletonComponent,
  NoticeComponent,
  TextFieldComponent,
} from '../../../shared/ui';
import { WORKOUT_PATH, customPlanPickerPath } from '../workout-paths';
import { CUSTOM_PLAN_COPY } from './custom-plan-content';
import { PrescriptionField, toSpec } from './custom-plan-draft';
import { CustomPlanDraftService } from './custom-plan-draft.service';
import { toEditorView } from './custom-plan-editor-view-model';

/**
 * The custom plan editor (Premium; see requireCustomPlanAccess): for each training day, the exercises
 * with their sets, reps (or time) and rest, in order. Edits only change the shared draft; the active plan
 * is replaced when the user reviews and saves, and left alone on Cancel or Back.
 */
@Component({
  selector: 'app-custom-plan-editor',
  templateUrl: './custom-plan-editor.page.html',
  styleUrl: './custom-plan-editor.page.scss',
  host: { class: 'fit-theme-dashboard' },
  imports: [
    IonContent,
    IonFooter,
    IonIcon,
    BottomSheetComponent,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessIconButtonComponent,
    LoadingSkeletonComponent,
    NoticeComponent,
    TextFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomPlanEditorPage {
  private readonly drafts = inject(CustomPlanDraftService);
  private readonly plans = inject(WorkoutPlanService);
  private readonly nav = inject(NavController);

  protected readonly copy = CUSTOM_PLAN_COPY;
  /** True when the active plan is already a custom one (edit) rather than a generated one (build). */
  protected readonly editing = computed(() => !!this.drafts.base()?.custom);

  /** Keeps a draft returning from the picker; starts one from the active plan otherwise. */
  private readonly loaded = resource({ loader: () => this.drafts.ensure() });
  protected readonly status = computed<'loading' | 'ready' | 'unavailable'>(() => {
    if (this.loaded.isLoading()) {
      return 'loading';
    }
    return this.loaded.hasValue() && this.loaded.value() ? 'ready' : 'unavailable';
  });

  protected readonly view = computed(() => {
    const plan = this.drafts.base();
    const draft = this.drafts.draft();
    return plan && draft ? toEditorView(plan, draft, this.drafts.catalog) : null;
  });

  /** Exercises whose prescription fields are open (`sessionId:exerciseId`). UI state only. */
  private readonly open = signal<ReadonlySet<string>>(new Set());
  protected readonly reviewOpen = signal(false);
  protected readonly discardOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveMessage = signal('');

  protected isOpen(sessionId: string, exerciseId: string): boolean {
    return this.open().has(`${sessionId}:${exerciseId}`);
  }

  protected toggle(sessionId: string, exerciseId: string): void {
    const key = `${sessionId}:${exerciseId}`;
    this.open.update((set) => {
      const next = new Set(set);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });
  }

  protected fieldValue(sessionId: string, exerciseId: string, field: PrescriptionField): string {
    const exercise = this.drafts.draft()?.find((d) => d.sessionId === sessionId)?.exercises.find((e) => e.exerciseId === exerciseId);
    return exercise?.[field] ?? '';
  }

  protected edit(sessionId: string, exerciseId: string, field: PrescriptionField, value: string): void {
    this.drafts.edit(sessionId, exerciseId, field, value);
  }

  protected move(sessionId: string, exerciseId: string, direction: -1 | 1): void {
    this.drafts.move(sessionId, exerciseId, direction);
  }

  protected remove(sessionId: string, exerciseId: string): void {
    this.drafts.remove(sessionId, exerciseId);
  }

  protected addExercises(sessionId: string): void {
    void this.nav.navigateForward(customPlanPickerPath(sessionId));
  }

  protected review(): void {
    this.saveMessage.set('');
    this.reviewOpen.set(true);
  }

  /** Cancel: nothing to lose leaves at once; unsaved changes are confirmed first. */
  protected cancel(): void {
    if (this.drafts.dirty()) {
      this.discardOpen.set(true);
    } else {
      this.leave();
    }
  }

  protected discard(): void {
    this.discardOpen.set(false);
    this.leave();
  }

  protected async save(): Promise<void> {
    const view = this.view();
    const draft = this.drafts.draft();
    if (!view?.canSave || !draft || this.saving()) {
      return;
    }
    const spec = toSpec(draft, this.drafts.catalog);
    if (!spec) {
      this.saveMessage.set(this.copy.review.invalid);
      return;
    }
    this.saving.set(true);
    this.saveMessage.set('');
    try {
      const result = await this.plans.saveCustomPlan(spec);
      switch (result.kind) {
        case 'saved':
          this.reviewOpen.set(false);
          this.leave();
          return;
        case 'invalid':
          this.saveMessage.set(this.copy.review.invalid);
          return;
        case 'not-allowed':
          this.saveMessage.set(this.copy.review.notAllowed);
          return;
        case 'unavailable':
          this.saveMessage.set(this.copy.review.unavailable);
          return;
        default:
          this.saveMessage.set(this.copy.review.failed);
      }
    } finally {
      this.saving.set(false);
    }
  }

  /** Drops the draft and returns to the workout tab. */
  private leave(): void {
    this.drafts.discard();
    void this.nav.navigateBack(WORKOUT_PATH);
  }

  protected backToWorkout(): void {
    void this.nav.navigateBack(WORKOUT_PATH);
  }
}
