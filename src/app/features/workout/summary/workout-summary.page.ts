import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonFooter, IonHeader, IonIcon, IonToolbar, NavController, Platform } from '@ionic/angular';

import { HOME_PATH } from '../../../core/profile/onboarding.guards';
import { ThemeService } from '../../../core/theme/theme.service';
import { CLOCK } from '../../../core/time/clock';
import { WorkoutHistoryService } from '../../../core/workout/workout-history.service';
import { WorkoutLogService } from '../../../core/workout/workout-log.service';
import { WorkoutPlanService } from '../../../core/workout/workout-plan.service';
import { EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent } from '../../../shared/ui';
import { NUTRITION_PATH } from '../../nutrition/nutrition-paths';
import { WORKOUT_COPY } from '../workout-content';
import { WORKOUT_PATH, workoutSessionPath } from '../workout-paths';
import { toWorkoutScreen } from '../workout-view-model';
import { SummaryBreakdownComponent } from './views/breakdown-view.component';
import { SummaryInsightsComponent } from './views/insights-view.component';
import { NextWorkoutView, SummaryNextAction, SummaryNextComponent } from './views/next-view.component';
import { SummaryOverviewComponent } from './views/overview-view.component';
import { toWorkoutSummaryScreen } from './workout-summary-view-model';

/** The four views, in order. The overview needs no query parameter. */
export const SUMMARY_VIEWS = ['overview', 'exercises', 'insights', 'next'] as const;
export type SummaryView = (typeof SUMMARY_VIEWS)[number];
const isView = (value: unknown): value is SummaryView => (SUMMARY_VIEWS as readonly unknown[]).includes(value);
/** Overview and Insights are dark (immersive); Exercises and Next are warm light. */
const DARK_VIEWS: ReadonlySet<SummaryView> = new Set(['overview', 'insights']);
const PROGRESS_PATH = '/progress';

type FooterAction = 'exercises' | 'insights' | 'next' | 'home' | 'plan';

export const summaryUrl = (workoutId: string, view: SummaryView) =>
  `/workout/summary/${encodeURIComponent(workoutId)}${view === 'overview' ? '' : `?view=${view}`}`;

/**
 * Workout Summary for one finished workout (`/workout/summary/:workoutId`):
 * Overview → Exercise breakdown → Performance insights → What's next.
 *
 * The view is the `view` query parameter on the same route, so the page and
 * the loaded workout stay put while Back (browser, in-page, Android) moves
 * between views. Only a finished workout is ever shown: an id that isn't one
 * (in progress, discarded, unknown) shows "Summary unavailable".
 */
@Component({
  selector: 'app-workout-summary',
  templateUrl: './workout-summary.page.html',
  styleUrl: './workout-summary.page.scss',
  imports: [
    IonHeader,
    IonToolbar,
    IonContent,
    IonFooter,
    IonIcon,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    SummaryOverviewComponent,
    SummaryBreakdownComponent,
    SummaryInsightsComponent,
    SummaryNextComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.fit-theme-immersive]': 'dark()',
    '[class.fit-theme-dashboard]': '!dark()',
  },
})
export class WorkoutSummaryPage {
  /** Route parameter. */
  readonly workoutId = input.required<string>();
  /** Query parameter (`?view=exercises`); anything unknown shows the overview. */
  readonly view = input<string>();

  private readonly logs = inject(WorkoutLogService);
  private readonly history = inject(WorkoutHistoryService);
  private readonly plans = inject(WorkoutPlanService);
  private readonly clock = inject(CLOCK);
  private readonly nav = inject(NavController);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly theme = inject(ThemeService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly copy = WORKOUT_COPY.summary;

  protected readonly state = resource({
    params: () => ({ id: this.workoutId() }),
    loader: async ({ params }) => {
      const log = await this.logs.loadCompleted(params.id);
      // Only a finished workout has a summary (never an in-progress one).
      if (!log || log.status !== 'completed') {
        return null;
      }
      const history = await this.history.list();
      return toWorkoutSummaryScreen(log, history.ok ? history.workouts : null);
    },
  });
  protected readonly summary = computed(() => (this.state.hasValue() ? this.state.value() : null));

  /** The plan's next training day after today (null without a plan). */
  protected readonly nextWorkout = resource({
    loader: async (): Promise<NextWorkoutView | null> => {
      try {
        const screen = toWorkoutScreen(await this.plans.load(), this.clock());
        const next = screen.kind === 'ready' ? screen.upNext : null;
        return next?.sessionId && next.session.kind !== 'rest'
          ? { title: next.session.title, weekday: next.weekday, sessionId: next.sessionId }
          : null;
      } catch {
        return null;
      }
    },
  });

  protected readonly current = computed<SummaryView>(() => {
    const view = this.view();
    return this.summary() && isView(view) ? view : 'overview';
  });
  protected readonly dark = computed(() => DARK_VIEWS.has(this.current()));
  protected readonly navigating = signal(false);

  protected readonly actions = computed<readonly FooterAction[]>(() => {
    if (!this.summary()) {
      return ['home'];
    }
    switch (this.current()) {
      case 'overview':
        return ['exercises', 'home'];
      case 'exercises':
        return ['insights'];
      case 'insights':
        return ['next'];
      case 'next':
        return ['home', 'plan'];
    }
  });

  protected readonly actionLabels = computed<Record<FooterAction, string>>(() => ({
    exercises: this.copy.actions.breakdown,
    insights: this.copy.actions.insights,
    next: this.copy.actions.next,
    home: this.current() === 'next' ? this.copy.actions.goHome : this.copy.actions.home,
    plan: this.copy.actions.plan,
  }));

  private readonly content = viewChild(IonContent);
  /** Views this page pushed onto browser history (Back pops those rather than adding entries). */
  private pushed = 0;

  constructor() {
    // Light status-bar text while a dark view shows.
    let release: (() => void) | null = null;
    effect(() => {
      const dark = this.dark();
      if (dark && !release) {
        release = this.theme.holdAlwaysDark();
      } else if (!dark && release) {
        release();
        release = null;
      }
    });
    inject(DestroyRef).onDestroy(() => release?.());

    // Each view starts at the top, with focus on its heading.
    effect(() => {
      this.current();
      afterNextRender(
        () => {
          void this.content()?.scrollToTop(0);
          this.host.nativeElement.querySelector<HTMLElement>('[data-view-heading]')?.focus({ preventScroll: true });
        },
        { injector: this.injector },
      );
    });

    // Android back steps back through the views before leaving the page.
    const backButton = inject(Platform).backButton.subscribeWithPriority(10, (processNextHandler) => {
      if (this.current() !== 'overview') {
        void this.back();
      } else {
        processNextHandler();
      }
    });
    inject(DestroyRef).onDestroy(() => backButton.unsubscribe());
  }

  protected async back(): Promise<void> {
    const index = SUMMARY_VIEWS.indexOf(this.current());
    if (index <= 0) {
      return;
    }
    if (this.pushed > 0) {
      this.pushed--;
      this.location.back();
      return;
    }
    await this.router.navigateByUrl(summaryUrl(this.workoutId(), SUMMARY_VIEWS[index - 1]), { replaceUrl: true });
  }

  protected async run(action: FooterAction): Promise<void> {
    switch (action) {
      case 'exercises':
      case 'insights':
      case 'next':
        if (await this.router.navigateByUrl(summaryUrl(this.workoutId(), action))) {
          this.pushed++;
        }
        return;
      case 'plan':
        await this.leave(WORKOUT_PATH);
        return;
      default:
        await this.leave(HOME_PATH);
    }
  }

  /** An exercise's performance over time (Progress). */
  protected openExercise(exerciseId: string): void {
    void this.nav.navigateForward([PROGRESS_PATH, 'exercise', exerciseId]);
  }

  protected async openNext(action: SummaryNextAction): Promise<void> {
    switch (action) {
      case 'nutrition':
        await this.leave(NUTRITION_PATH);
        return;
      case 'progress':
        await this.leave(PROGRESS_PATH);
        return;
      default: {
        const next = this.nextWorkout.hasValue() ? this.nextWorkout.value() : null;
        if (next) {
          await this.leave(WORKOUT_PATH, workoutSessionPath(next.sessionId));
        } else {
          await this.leave(WORKOUT_PATH);
        }
      }
    }
  }

  /** Into the tabs: the summary is done, so it is not kept underneath. */
  private async leave(root: string, then?: readonly string[]): Promise<void> {
    if (this.navigating()) {
      return;
    }
    this.navigating.set(true);
    try {
      await this.nav.navigateRoot(root);
      if (then) {
        await this.nav.navigateForward([...then]);
      }
    } finally {
      this.navigating.set(false);
    }
  }
}
