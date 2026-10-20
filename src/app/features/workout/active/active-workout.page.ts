import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, resource, signal, viewChild } from '@angular/core';
import { IonContent, IonFooter, IonHeader, IonIcon, IonToolbar, NavController, Platform } from '@ionic/angular';

import { ThemeService } from '../../../core/theme/theme.service';
import { CLOCK } from '../../../core/time/clock';
import { WorkoutHistoryService } from '../../../core/workout/workout-history.service';
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
import { exercisePhoto } from '../workout-photos';
import { WorkoutArtComponent } from '../../home/components/workout-art/workout-art.component';
import { ExerciseDemoComponent } from '../components/exercise-demo.component';
import { ActiveFooterComponent } from './active-footer.component';
import { MuscleFigureComponent } from './muscle-figure.component';
import { NextExerciseCardComponent } from './next-exercise-card.component';
import { RestTimerComponent } from './rest-timer.component';
import { RestTimer } from './rest-timer';
import { DraftEdit, SetError, SetLoggerComponent } from './set-logger.component';
import { FieldKey, toActiveWorkoutView } from './active-workout-view-model';
import { formatElapsed, spokenElapsed } from './workout-clock';

type DialogKind = 'menu' | 'skip-exercise' | 'leave-incomplete' | 'finish' | 'exit' | 'discard';

interface DialogAction {
  readonly label: string;
  readonly variant: 'primary' | 'outline' | 'ghost' | 'danger';
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
    ActiveFooterComponent,
    MuscleFigureComponent,
    NextExerciseCardComponent,
    RestTimerComponent,
    WorkoutArtComponent,
    ExerciseDemoComponent,
    SetLoggerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Always dark (see docs/design-system.md, "Immersive mode"): used mid-set, often at arm's length.
  host: { class: 'fit-theme-immersive' },
})
export class ActiveWorkoutPage {
  /** Route parameter (`/workout/session/:sessionId/active`). */
  readonly sessionId = input.required<string>();

  private readonly logs = inject(WorkoutLogService);
  private readonly workoutHistory = inject(WorkoutHistoryService);
  private readonly nav = inject(NavController);
  private readonly clock = inject(CLOCK);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly timer = inject(RestTimer);

  protected readonly copy = WORKOUT_COPY.active;
  protected readonly photo = exercisePhoto;
  protected readonly backLabel = WORKOUT_COPY.detail.backToWorkout;
  private readonly loaded = resource({ loader: () => this.logs.loadActive() });
  /** Finished workouts, to prefill sets with last time's values (none if history can't be read). */
  private readonly history = resource({
    loader: async () => {
      const result = await this.workoutHistory.list();
      return result.ok ? result.workouts : [];
    },
  });

  /** The in-progress workout for this route's session (another session's workout is not shown here). */
  protected readonly view = computed(() => {
    const log = this.logs.active();
    return log && log.source.sessionId === this.sessionId() ? toActiveWorkoutView(log, undefined, this.history.hasValue() ? this.history.value() : []) : null;
  });
  protected readonly screen = computed<'loading' | 'active' | 'not-active'>(() =>
    this.view() ? 'active' : this.loaded.isLoading() ? 'loading' : 'not-active',
  );
  protected readonly saveFailed = this.logs.saveFailed;
  private readonly content = viewChild(IonContent);

  /** Shown while resting or whenever this exercise has programmed rest (to start by hand). */
  protected readonly restVisible = computed(() => this.timer.status() !== 'idle' || (this.view()?.exercise.restSeconds ?? 0) > 0);

  /** Ticks every second while a workout is shown; the elapsed time is always measured from its start. */
  private readonly now = signal(this.clock());
  protected readonly workoutTime = computed(() => formatElapsed(this.view()?.startedAt ?? '', this.now()));
  protected readonly workoutTimeSpoken = computed(() => spokenElapsed(this.view()?.startedAt ?? '', this.now()));

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
    // The status bar gets light text even in a light Appearance while this always-dark screen is open.
    const releaseStatusBar = inject(ThemeService).holdAlwaysDark();
    inject(DestroyRef).onDestroy(releaseStatusBar);

    // Android Back asks the same "Leave this workout?" as the header's back button, instead of
    // dropping out of a session in progress. An open sheet handles Back itself (higher priority).
    const backButton = inject(Platform).backButton.subscribeWithPriority(10, (processNextHandler) => {
      if (this.view()) {
        this.openDialog('exit');
      } else {
        processNextHandler();
      }
    });
    inject(DestroyRef).onDestroy(() => backButton.unsubscribe());

    effect(() => {
      if (this.timer.status() === 'done') {
        this.announcement.set(this.copy.rest.complete);
      }
    });

    // When the current set changes, keep it above the footer (matters on short phones).
    effect(() => {
      const view = this.view();
      if (view) {
        void [view.exerciseIndex, view.exercise.nextPendingSet];
        this.scheduleReveal();
      }
    });

    effect((onCleanup) => {
      if (!this.view()) {
        return;
      }
      this.now.set(this.clock());
      const interval = setInterval(() => this.now.set(this.clock()), 1000);
      onCleanup(() => clearInterval(interval));
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
    // The user is fixing it: drop the message (completing again re-validates).
    if (this.errorsByExercise()[exercise]?.[setIndex]) {
      this.setError(exercise, setIndex, null);
    }
  }

  /** The footer's main action: completes the current set with what is in its inputs. */
  protected completeCurrent(): void {
    const set = this.view()?.exercise.nextPendingSet;
    if (set !== null && set !== undefined) {
      void this.completeSet(set);
    }
  }

  /** Starts the exercise's programmed rest by hand. */
  protected startRest(): void {
    const seconds = this.view()?.exercise.restSeconds ?? 0;
    if (seconds > 0) {
      this.timer.start(seconds);
    }
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

  /** The footer's way on and the "Next up" card: the next exercise (asking first if sets are left), or finishing on the last. */
  protected openNext(): void {
    if (this.view()?.isLast) {
      this.openDialog('finish');
    } else {
      this.next();
    }
  }

  protected previous(): void {
    const view = this.view();
    if (view && !view.isFirst) {
      void this.goTo(view.exerciseIndex - 1);
    }
  }

  private async goTo(index: number): Promise<void> {
    await this.logs.goToExercise(index);
    const view = this.view();
    if (view) {
      this.announcement.set(`${view.exercise.name}. ${view.position}`);
    }
    // A new exercise starts at its top: demonstration first, then the sets.
    void this.content()?.scrollToTop(0);
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
      case 'menu':
        return {
          title: this.copy.menu.title,
          message: '',
          actions: this.menuActions(view, cancel(d.exit.cancel)),
        };
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
              variant: 'danger',
              run: async () => {
                this.closeDialog();
                this.timer.skip();
                await this.logs.discard();
                void this.nav.navigateRoot('/workout');
              },
            },
            { label: d.discard.cancel, variant: 'outline', run: () => this.closeDialog() },
          ],
        };
    }
  }

  /**
   * The options menu: everything the screen keeps off its face. Rest controls
   * while resting, then skipping a set or the exercise, going back, finishing
   * and leaving (finishing, skipping an exercise and leaving still confirm).
   */
  private menuActions(view: NonNullable<ReturnType<typeof this.view>>, cancelAction: DialogAction): DialogAction[] {
    const actions: DialogAction[] = [];
    const run = (fn: () => void | Promise<void>) => async () => {
      this.closeDialog();
      await fn();
    };
    const resting = this.timer.status() === 'running' || this.timer.status() === 'paused';
    if (resting) {
      actions.push({ label: this.copy.rest.skip, variant: 'outline', run: run(() => this.timer.skip()) });
      actions.push({ label: this.copy.restartRest, variant: 'outline', run: run(() => this.timer.restart()) });
    }
    const nextSet = view.exercise.nextPendingSet;
    if (nextSet !== null) {
      actions.push({ label: this.copy.skipSet(nextSet + 1), variant: 'outline', run: run(() => this.skipSet(nextSet)) });
    }
    if (view.exercise.pending > 0) {
      actions.push({ label: this.copy.skipExercise, variant: 'outline', run: () => this.dialogKind.set('skip-exercise') });
    }
    if (!view.isFirst) {
      actions.push({ label: this.copy.previousLabel, variant: 'outline', run: run(() => this.previous()) });
    }
    actions.push({ label: this.copy.finish, variant: 'primary', run: () => this.dialogKind.set('finish') });
    actions.push({ label: this.copy.leaveWorkout, variant: 'outline', run: () => this.dialogKind.set('exit') });
    actions.push(cancelAction);
    return actions;
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

  private scheduleReveal(): void {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => void this.revealCurrentSet());
    }
  }

  /** Scrolls the minimum needed so the current set isn't hidden under the footer (or above the top). */
  private async revealCurrentSet(): Promise<void> {
    const content = this.content();
    const row = this.host.nativeElement.querySelector('[aria-current="step"]');
    if (!content || !row || typeof content.getScrollElement !== 'function') {
      return;
    }
    try {
      const area = (await content.getScrollElement()).getBoundingClientRect();
      const rect = row.getBoundingClientRect();
      const margin = 12;
      if (rect.bottom > area.bottom - margin) {
        await content.scrollByPoint(0, rect.bottom - area.bottom + margin, 250);
      } else if (rect.top < area.top + margin) {
        await content.scrollByPoint(0, rect.top - area.top - margin, 250);
      }
    } catch {
      // Scrolling is a convenience; never let it break logging.
    }
  }

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
