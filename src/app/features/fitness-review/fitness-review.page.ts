import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, resource } from '@angular/core';
import { Router } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, NavController } from '@ionic/angular';

import { FitnessReviewService } from '../../core/fitness-review/fitness-review.service';
import { IsoCalendarDate } from '../../domain/fitness-profile';
import { shiftWeek, weekStartOf } from '../../domain/nutrition';
import { EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent } from '../../shared/ui';
import { BODY_COMPOSITION_HISTORY_PATH } from '../body-composition/body-composition-paths';
import { MEASUREMENT_HISTORY_PATH, NEW_MEASUREMENT_PATH } from '../body-measurements/measurement-paths';
import { NEW_WEIGHT_PATH, WEIGHT_HISTORY_PATH } from '../body-weight/weight-history-paths';
import { NUTRITION_PATH, NUTRITION_WEEK_PATH } from '../nutrition/nutrition-paths';
import { WORKOUT_PATH } from '../workout/workout-paths';
import { ReviewActionsComponent, ReviewBodyComponent, ReviewNutritionComponent, ReviewTrainingComponent } from './components/review-sections.component';
import { FITNESS_REVIEW_COPY } from './fitness-review-content';
import { ReviewLink, ReviewScreen, toReviewScreen } from './fitness-review-view-model';

type PageState = { readonly kind: 'loading' } | { readonly kind: 'error' } | ({ readonly kind: 'ready' } & ReviewScreen);

/**
 * Weekly Fitness Review: one Monday–Sunday week of training, nutrition and
 * body records with a few prioritised, explained actions. Deterministic and
 * read-only; every insight links to the screen where it can be acted on.
 */
@Component({
  selector: 'app-fitness-review',
  templateUrl: './fitness-review.page.html',
  styleUrl: './fitness-review.page.scss',
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonIcon,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    ReviewActionsComponent,
    ReviewTrainingComponent,
    ReviewNutritionComponent,
    ReviewBodyComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FitnessReviewPage {
  /** Query parameter: a date in the week to open first (default: last complete week). */
  readonly date = input<string>();

  private readonly reviews = inject(FitnessReviewService);
  private readonly nav = inject(NavController);
  private readonly router = inject(Router);

  protected readonly copy = FITNESS_REVIEW_COPY;

  /** Monday of the shown week; never after the current week. */
  protected readonly weekStart = linkedSignal<IsoCalendarDate>(() => {
    const requested = weekStartOf(this.date() ?? this.reviews.defaultWeek());
    const current = this.reviews.currentWeek();
    return requested && requested <= current ? requested : current;
  });

  private readonly state = resource({
    params: () => ({ start: this.weekStart() }),
    loader: async ({ params }) => toReviewScreen(await this.reviews.review(params.start)),
  });

  /** Keeps the shown week while reloading (no flash back to the skeleton). */
  protected readonly screen = computed<PageState>(() => {
    if (this.state.hasValue()) {
      return { kind: 'ready', ...this.state.value() };
    }
    return this.state.error() ? { kind: 'error' } : { kind: 'loading' };
  });

  /** Shown when another week than the default (last complete) one is open. */
  protected readonly awayFromDefault = computed(() => this.weekStart() !== this.reviews.defaultWeek());

  /** One persistent live region: loading, errors and the week after moving between weeks. */
  protected readonly announcement = computed(() => {
    const s = this.screen();
    switch (s.kind) {
      case 'loading':
        return this.copy.loading;
      case 'error':
        return this.copy.error.title;
      default:
        return `${this.copy.title}, ${s.header.range}. ${s.summary}`;
    }
  });

  private entered = false;

  /** Re-entry (e.g. back from logging): re-read every record. */
  ionViewWillEnter(): void {
    if (this.entered) {
      this.state.reload();
    }
    this.entered = true;
  }

  protected previousWeek(): void {
    const prev = shiftWeek(this.weekStart(), -1);
    if (prev) {
      this.weekStart.set(prev);
    }
  }

  protected nextWeek(): void {
    const next = shiftWeek(this.weekStart(), 1);
    if (next && next <= this.reviews.currentWeek()) {
      this.weekStart.set(next);
    }
  }

  protected lastWeek(): void {
    this.weekStart.set(this.reviews.defaultWeek());
  }

  protected retry(): void {
    this.state.reload();
  }

  protected open(link: ReviewLink): void {
    switch (link.kind) {
      case 'workout':
        void this.router.navigateByUrl(WORKOUT_PATH);
        return;
      case 'nutrition':
        void this.router.navigateByUrl(NUTRITION_PATH);
        return;
      case 'nutrition-week':
        void this.nav.navigateForward(NUTRITION_WEEK_PATH, { queryParams: { date: link.date } });
        return;
      case 'exercise':
        void this.nav.navigateForward(['/you', 'progress', 'exercise', link.exerciseId]);
        return;
      case 'weigh-in':
        void this.nav.navigateForward(NEW_WEIGHT_PATH);
        return;
      case 'measure':
        void this.nav.navigateForward(NEW_MEASUREMENT_PATH);
        return;
      case 'weight-history':
        void this.nav.navigateForward(WEIGHT_HISTORY_PATH);
        return;
      case 'measurements':
        void this.nav.navigateForward(MEASUREMENT_HISTORY_PATH);
        return;
      case 'body-composition':
        void this.nav.navigateForward(BODY_COMPOSITION_HISTORY_PATH);
        return;
    }
  }
}
