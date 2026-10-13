import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonBackButton, IonContent, IonIcon, NavController } from '@ionic/angular';

import { CLOCK } from '../../../core/time/clock';
import { WorkoutHistoryService } from '../../../core/workout/workout-history.service';
import { performedExercises } from '../../../domain/workout-session';
import { EmptyStateComponent, FitnessButtonComponent, FitnessCardComponent, LoadingSkeletonComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { ALL_AREAS, ExerciseRowView, ExerciseSort, areaFilters, queryExercises, toExerciseRow } from './exercise-list-view-model';
import { ExerciseRowListComponent } from './exercise-row-list.component';
import { progressBaseOf } from './progress-paths';

/**
 * Every exercise the user has completed sets for: search by name or body
 * area, filter by area (only areas present), sort by most recent or name.
 * The three work together; "Clear filters" resets them. Rows open the
 * exercise's performance by its logged id.
 */
@Component({
  selector: 'app-progress-exercises',
  template: `
    <ion-content>
      <main class="body">
        <div class="topbar">
          <ion-back-button class="back" [defaultHref]="base" text="" icon="chevron-back" [attr.aria-label]="copy.back" />
        </div>
        <h1 class="title">{{ list.title }}</h1>
        <p class="visually-hidden" role="status" data-testid="announcement">{{ announcement() }}</p>

        @if (rows(); as all) {
          @if (all.length > 0) {
            <label class="search">
              <ion-icon name="search-outline" aria-hidden="true" />
              <span class="visually-hidden">{{ list.search }}</span>
              <input
                type="search"
                [placeholder]="list.search"
                autocomplete="off"
                enterkeyhint="search"
                [value]="search()"
                (input)="search.set($any($event.target).value)"
                data-testid="exercise-search"
              />
            </label>

            <div class="filters" role="group" [attr.aria-label]="list.filterLabel" data-testid="area-filters">
              @for (a of areas(); track a) {
                <button type="button" class="filter" [attr.aria-pressed]="area() === a" (click)="area.set(a)">{{ a === all_ ? list.all : a }}</button>
              }
            </div>

            <label class="sort">
              <span class="visually-hidden">{{ list.sort }}</span>
              <select [value]="sort()" (change)="sort.set($any($event.target).value)" data-testid="exercise-sort">
                <option value="recent">{{ list.sortOptions.recent }}</option>
                <option value="name">{{ list.sortOptions.name }}</option>
              </select>
              <ion-icon name="chevron-down" aria-hidden="true" />
            </label>

            @if (shown().length > 0) {
              <app-exercise-row-list [rows]="shown()" (openExercise)="open($event)" />
            } @else {
              <fit-card data-testid="exercises-no-match">
                <fit-empty-state icon="search-outline" [title]="list.noMatches" [description]="list.noMatchesHint">
                  <button fit-button type="button" variant="secondary" (click)="clear()">{{ list.clear }}</button>
                </fit-empty-state>
              </fit-card>
            }
          } @else {
            <fit-card data-testid="exercises-empty">
              <fit-empty-state icon="barbell-outline" [title]="copy.empty.title" [description]="list.none" />
            </fit-card>
          }
        } @else if (state.isLoading()) {
          <div class="loading" aria-busy="true"><fit-skeleton height="44px" radius="card" /><fit-skeleton height="320px" radius="card" /></div>
        } @else {
          <fit-card data-testid="exercises-error">
            <fit-empty-state icon="alert-circle-outline" [title]="copy.error.title" [description]="copy.error.message">
              <button fit-button type="button" (click)="state.reload()">{{ copy.error.retry }}</button>
            </fit-empty-state>
          </fit-card>
        }
      </main>
    </ion-content>
  `,
  styleUrl: './progress-exercises.page.scss',
  host: { class: 'fit-theme-dashboard' },
  imports: [
    IonBackButton,
    IonContent,
    IonIcon,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    LoadingSkeletonComponent,
    ExerciseRowListComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressExercisesPage {
  private readonly history = inject(WorkoutHistoryService);
  private readonly clock = inject(CLOCK);
  private readonly nav = inject(NavController);
  protected readonly base = progressBaseOf(inject(ActivatedRoute));

  protected readonly copy = WORKOUT_COPY.progress;
  protected readonly list = WORKOUT_COPY.progress.exercises;
  protected readonly all_ = ALL_AREAS;

  protected readonly state = resource({ loader: () => this.history.list() });
  /** null while loading or when history can't be read. */
  protected readonly rows = computed<readonly ExerciseRowView[] | null>(() => {
    const result = this.state.hasValue() ? this.state.value() : null;
    return result?.ok ? performedExercises(result.workouts).map((p) => toExerciseRow(p, this.clock())) : null;
  });

  // UI state only (kept while the page is open, so coming back keeps the same list).
  protected readonly search = signal('');
  protected readonly area = signal<string>(ALL_AREAS);
  protected readonly sort = signal<ExerciseSort>('recent');

  protected readonly areas = computed(() => areaFilters(this.rows() ?? []));
  protected readonly shown = computed(() => queryExercises(this.rows() ?? [], { search: this.search(), area: this.area(), sort: this.sort() }));

  protected readonly announcement = computed(() => {
    if (this.state.isLoading()) {
      return this.copy.loading;
    }
    if (this.rows() === null) {
      return this.copy.error.title;
    }
    return this.rows()!.length > 0 && this.shown().length === 0 ? this.list.noMatches : '';
  });

  protected clear(): void {
    this.search.set('');
    this.area.set(ALL_AREAS);
  }

  protected open(exerciseId: string): void {
    void this.nav.navigateForward([this.base, 'exercise', exerciseId]);
  }
}
