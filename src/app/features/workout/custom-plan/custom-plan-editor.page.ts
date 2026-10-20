import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, resource, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonFooter, IonIcon, NavController, Platform } from '@ionic/angular';

import { WorkoutPlanService } from '../../../core/workout/workout-plan.service';
import {
  BottomSheetComponent,
  EmptyStateComponent,
  FitnessButtonComponent,
  LoadingSkeletonComponent,
  NoticeComponent,
} from '../../../shared/ui';
import { WORKOUT_PATH, customPlanPickerPath } from '../workout-paths';
import { CUSTOM_PLAN_COPY } from './custom-plan-content';
import { toSpec } from './custom-plan-draft';
import { CustomPlanDraftService } from './custom-plan-draft.service';
import { toEditorView } from './custom-plan-editor-view-model';
import { CustomPlanHeaderComponent } from './custom-plan-header.component';

/**
 * The custom plan editor (Premium; see requireCustomPlanAccess), steps 1 and 3 of the flow: Basics lists
 * the training days (each opens step 2, the exercise picker for that day, where its exercises are chosen
 * and edited) and Review shows the whole plan before saving. Edits only change the shared draft; the active
 * plan is replaced when the user saves, and left alone on Cancel or Back. `?step=review` opens the review.
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
    CustomPlanHeaderComponent,
    EmptyStateComponent,
    FitnessButtonComponent,
    LoadingSkeletonComponent,
    NoticeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomPlanEditorPage {
  private readonly drafts = inject(CustomPlanDraftService);
  private readonly plans = inject(WorkoutPlanService);
  private readonly nav = inject(NavController);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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

  protected readonly step = signal<'basics' | 'review'>('basics');
  protected readonly discardOpen = signal(false);
  private readonly discardSheet = viewChild<BottomSheetComponent>('discardSheet');
  protected readonly saving = signal(false);
  protected readonly saveMessage = signal('');

  constructor() {
    // The page stays alive under the picker (Ionic keeps it in the stack), so follow `?step=` as it changes.
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed())
      .subscribe((params) => this.step.set(params.get('step') === 'review' ? 'review' : 'basics'));
    // Android Back is Cancel: unsaved changes are confirmed first. An open sheet closes itself on Back
    // (Ionic's overlay handler outranks this one); while the exercise picker is on top, Back is its own.
    const backButton = inject(Platform).backButton.subscribeWithPriority(10, (processNextHandler) => {
      if (this.host.nativeElement.classList.contains('ion-page-hidden')) {
        processNextHandler();
      } else {
        this.cancel();
      }
    });
    inject(DestroyRef).onDestroy(() => backButton.unsubscribe());
  }

  protected addExercises(sessionId: string): void {
    void this.nav.navigateForward(customPlanPickerPath(sessionId));
  }

  /** Basics → the first training day's exercises. */
  protected next(): void {
    const first = this.view()?.days[0];
    if (first) {
      this.addExercises(first.sessionId);
    }
  }

  /** Header Back: Review returns to Basics; Basics is Cancel. */
  protected back(): void {
    if (this.step() === 'review') {
      this.step.set('basics');
    } else {
      this.cancel();
    }
  }

  /** Header Save: saves straight away when the plan is valid, otherwise shows the review with what to fix. */
  protected saveFromHeader(): void {
    this.saveMessage.set('');
    this.step.set('review');
    if (this.view()?.canSave) {
      void this.save();
    }
  }

  /** Cancel: nothing to lose leaves at once; unsaved changes are confirmed first. */
  protected cancel(): void {
    if (this.drafts.dirty()) {
      this.discardOpen.set(true);
    } else {
      this.leave();
    }
  }

  protected async discard(): Promise<void> {
    // Close the sheet before leaving: navigating while it animates out can leave it showing.
    await this.discardSheet()?.dismiss().catch(() => false);
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
