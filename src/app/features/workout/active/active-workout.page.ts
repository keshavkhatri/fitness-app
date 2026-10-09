import { ChangeDetectionStrategy, Component, computed, effect, inject, input, resource, signal } from '@angular/core';
import { IonContent, IonFooter, IonHeader, IonIcon, IonToolbar, NavController } from '@ionic/angular';

import { WorkoutLogService } from '../../../core/workout/workout-log.service';
import { SetEntry } from '../../../domain/workout-session';
import {
  BottomSheetComponent,
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  FitnessProgressComponent,
  LoadingSkeletonComponent,
  NoticeComponent,
} from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { RestTimerComponent } from './rest-timer.component';
import { RestTimer } from './rest-timer';
import { DraftEdit, SetError, SetLoggerComponent } from './set-logger.component';
import { FieldKey, toActiveWorkoutView } from './active-workout-view-model';

type DialogKind = 'skip-exercise' | 'leave-incomplete' | 'finish' | 'exit' | 'discard';

interface DialogAction {
  readonly label: string;
  readonly variant: 'primary' | 'outline' | 'ghost';
  readonly run: () => void | Promise<void>;
}

interface DialogView {
  readonly title: string;
  readonly message: string;
  readonly actions: readonly DialogAction[];
}

/** Parses a typed number ("22,5" or "22.5"); empty or invalid input is null. */
const parseNumber = (text: string | undefined): number | null => {
  const trimmed = (text ?? '').trim().replace(',', '.');
  if (trimmed === '') {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
};

/**
 * Doing the workout: one exercise at a time, its sets as large logging rows,
 * a rest timer after each set, and explicit confirmations before anything
 * could lose or skip work. Renders the in-progress log from WorkoutLogService;
 * the plan is never touched here.
 */
@Component({
  selector: 'app-active-workout',
  templateUrl: './active-workout.page.html',
  styleUrl: './active-workout.page.scss',
  providers: [RestTimer],
  imports: [
    IonHeader,
    IonToolbar,
    IonContent,
    IonFooter,
    IonIcon,
    BottomSheetComponent,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    FitnessProgressComponent,
    LoadingSkeletonComponent,
    NoticeComponent,
    RestTimerComponent,
    SetLoggerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActiveWorkoutPage {
  /** Route parameter (`/workout/session/:sessionId/active`). */
  readonly sessionId = input.required<string>();

  private readonly logs = inject(WorkoutLogService);
  private readonly nav = inject(NavController);
  protected readonly timer = inject(RestTimer);

  protected readonly copy = WORKOUT_COPY.active;
  protected readonly backLabel = WORKOUT_COPY.detail.backToWorkout;
  private readonly loaded = resource({ loader: () => this.logs.loadActive() });

  /** The in-progress workout for this route's session (another session's workout is not shown here). */
  protected readonly view = computed(() => {
    const log = this.logs.active();
    return log && log.source.sessionId === this.sessionId() ? toActiveWorkoutView(log) : null;
  });
  protected readonly screen = computed<'loading' | 'active' | 'not-active'>(() =>
    this.view() ? 'active' : this.loaded.isLoading() ? 'loading' : 'not-active',
  );
  protected readonly saveFailed = this.logs.saveFailed;

  /** Unsaved input, per exercise then set. */
  private readonly drafts = signal<Readonly<Record<number, Readonly<Record<number, Partial<Record<FieldKey, string>>>>>>>({});
  private readonly errorsByExercise = signal<Readonly<Record<number, Readonly<Record<number, SetError>>>>>({});
  protected readonly currentDrafts = computed(() => this.drafts()[this.view()?.exerciseIndex ?? -1] ?? {});
  protected readonly currentErrors = computed(() => this.errorsByExercise()[this.view()?.exerciseIndex ?? -1] ?? {});

  protected readonly announcement = signal('');
  protected readonly busy = signal(false);
  protected readonly dialogKind = signal<DialogKind | null>(null);
  protected readonly dialogOpen = signal(false);
  protected readonly dialog = computed(() => this.dialogFor(this.dialogKind()));

  constructor() {
    effect(() => {
      if (this.timer.status() === 'done') {
        this.announcement.set(this.copy.rest.complete);
      }
    });
  }

  // --- Sets -------------------------------------------------------------------------------

  protected editDraft({ setIndex, field, value }: DraftEdit): void {
    const exercise = this.view()?.exerciseIndex;
    if (exercise === undefined) {
      return;
    }
    this.drafts.update((all) => ({
      ...all,
      [exercise]: { ...all[exercise], [setIndex]: { ...all[exercise]?.[setIndex], [field]: value } },
    }));
  }

  protected async completeSet(setIndex: number): Promise<void> {
    const view = this.view();
    if (!view || this.busy()) {
      return;
    }
    const row = view.exercise.sets[setIndex];
    const draft = this.currentDrafts()[setIndex] ?? {};
    const value = (key: FieldKey) => parseNumber(draft[key] ?? row.suggestion[key]);
    const entry: SetEntry = { weight: value('weight'), reps: value('reps'), durationSeconds: value('durationSeconds') };

    this.busy.set(true);
    try {
      const result = await this.logs.completeSet({ exercise: view.exerciseIndex, set: setIndex }, entry);
      if (!result.ok) {
        const field = result.error.field ?? null;
        const message = field ? this.copy.errors[field] : this.copy.errors.generic;
        this.setError(view.exerciseIndex, setIndex, { field, message });
        this.announcement.set(message);
        return;
      }
      this.setError(view.exerciseIndex, setIndex, null);
      this.clearDraft(view.exerciseIndex, setIndex);
      const after = this.view();
      const exerciseDone = after?.exercise.pending === 0;
      this.announcement.set(`${this.copy.setCompleted(row.setNumber)}${exerciseDone ? ` ${this.copy.allSetsDone}` : ''}`);
      // Programmed rest after a set, unless the whole workout has nothing left.
      if (view.exercise.restSeconds > 0 && (after?.pendingTotal ?? 0) > 0) {
        this.timer.start(view.exercise.restSeconds);
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** Undo a completed set (its values go back into the inputs for editing) or a skipped set. */
  protected async undoSet(setIndex: number): Promise<void> {
    const view = this.view();
    if (!view) {
      return;
    }
    const exerciseIndex = view.exerciseIndex;
    const log = this.logs.active();
    const set = log?.exercises[exerciseIndex].sets[setIndex];
    if (set?.status === 'completed') {
      const text = (n: number | null) => (n === null ? undefined : `${n}`);
      this.drafts.update((all) => ({
        ...all,
        [exerciseIndex]: {
          ...all[exerciseIndex],
          [setIndex]: { weight: text(set.weight), reps: text(set.reps), durationSeconds: text(set.durationSeconds) },
        },
      }));
    }
    await this.logs.resetSet({ exercise: exerciseIndex, set: setIndex });
  }

  protected async skipSet(setIndex: number): Promise<void> {
    const view = this.view();
    if (!view) {
      return;
    }
    const result = await this.logs.skipSet({ exercise: view.exerciseIndex, set: setIndex });
    if (result.ok) {
      this.setError(view.exerciseIndex, setIndex, null);
      this.announcement.set(this.copy.setSkipped(setIndex + 1));
    }
  }

  // --- Navigation -------------------------------------------------------------------------

  protected next(): void {
    const view = this.view();
    if (!view || view.isLast) {
      return;
    }
    if (view.exercise.pending > 0) {
      this.openDialog('leave-incomplete');
      return;
    }
    void this.goTo(view.exerciseIndex + 1);
  }

  protected previous(): void {
    const view = this.view();
    if (view && !view.isFirst) {
      void this.goTo(view.exerciseIndex - 1);
    }
  }

  private async goTo(index: number): Promise<void> {
    await this.logs.goToExercise(index);
  }

  protected openDialog(kind: DialogKind): void {
    this.dialogKind.set(kind);
    this.dialogOpen.set(true);
  }

  private closeDialog(): void {
    this.dialogOpen.set(false);
  }

  private dialogFor(kind: DialogKind | null): DialogView | null {
    const view = this.view();
    if (!kind || !view) {
      return null;
    }
    const d = this.copy.dialogs;
    const cancel = (label: string): DialogAction => ({ label, variant: 'ghost', run: () => this.closeDialog() });
    switch (kind) {
      case 'skip-exercise':
        return {
          title: d.skipExercise.title,
          message: d.skipExercise.message,
          actions: [
            {
              label: d.skipExercise.confirm,
              variant: 'primary',
              run: async () => {
                this.closeDialog();
                await this.logs.skipExercise(view.exerciseIndex);
                if (!view.isLast) {
                  await this.goTo(view.exerciseIndex + 1);
                }
              },
            },
            cancel(d.skipExercise.cancel),
          ],
        };
      case 'leave-incomplete':
        return {
          title: d.leaveIncomplete.title,
          message: d.leaveIncomplete.message(view.exercise.pending),
          actions: [
            {
              label: d.leaveIncomplete.confirm,
              variant: 'primary',
              run: async () => {
                this.closeDialog();
                await this.goTo(view.exerciseIndex + 1);
              },
            },
            cancel(d.leaveIncomplete.cancel),
          ],
        };
      case 'finish':
        return {
          title: d.finish.title,
          message: view.pendingTotal > 0 ? d.finish.incomplete(view.pendingTotal) : d.finish.complete,
          actions: [
            { label: view.pendingTotal > 0 ? d.finish.confirmAnyway : d.finish.confirm, variant: 'primary', run: () => this.finish() },
            cancel(d.finish.cancel),
          ],
        };
      case 'exit':
        return {
          title: d.exit.title,
          message: d.exit.message,
          actions: [
            {
              label: d.exit.leave,
              variant: 'primary',
              run: () => {
                this.closeDialog();
                void this.nav.navigateBack(['/workout', 'session', view.sessionId]);
              },
            },
            { label: d.exit.discard, variant: 'outline', run: () => this.dialogKind.set('discard') },
            cancel(d.exit.cancel),
          ],
        };
      case 'discard':
        return {
          title: d.discard.title,
          message: d.discard.message,
          actions: [
            {
              label: d.discard.confirm,
              variant: 'primary',
              run: async () => {
                this.closeDialog();
                this.timer.skip();
                await this.logs.discard();
                void this.nav.navigateRoot('/workout');
              },
            },
            cancel(d.discard.cancel),
          ],
        };
    }
  }

  private async finish(): Promise<void> {
    this.closeDialog();
    const result = await this.logs.finish();
    if (result.ok) {
      this.timer.skip();
      void this.nav.navigateRoot(['/workout', 'summary', result.log.id]);
    }
  }

  protected backToWorkout(): void {
    void this.nav.navigateRoot('/workout');
  }

  // --- Helpers ----------------------------------------------------------------------------

  private setError(exercise: number, set: number, error: SetError | null): void {
    this.errorsByExercise.update((all) => {
      const current = { ...all[exercise] };
      if (error) {
        current[set] = error;
      } else {
        delete current[set];
      }
      return { ...all, [exercise]: current };
    });
  }

  private clearDraft(exercise: number, set: number): void {
    this.drafts.update((all) => {
      const current = { ...all[exercise] };
      delete current[set];
      return { ...all, [exercise]: current };
    });
  }
}
