import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, resource, signal } from '@angular/core';
import { IonContent, IonHeader, IonIcon, IonToolbar, NavController } from '@ionic/angular';

import { ActivityStreakService } from '../../../core/streak/activity-streak.service';
import { ACTIVITY_KINDS, ActivityKind, STREAK_MILESTONES, activityGrid, streakSummary } from '../../../domain/daily-check-in';
import { FitnessButtonComponent, LoadingSkeletonComponent } from '../../../shared/ui';
import { StreakGridComponent } from './streak-grid.component';

const KIND_LABELS: Readonly<Record<ActivityKind, string>> = {
  workout: 'Workout',
  activity: 'Light activity',
  food: 'Food',
  weight: 'Weigh-in',
  steps: 'Steps',
  recovery: 'Recovery check-in',
};
const KIND_ICONS: Readonly<Record<ActivityKind, string>> = {
  workout: 'barbell-outline',
  activity: 'walk-outline',
  food: 'restaurant-outline',
  weight: 'scale-outline',
  steps: 'walk-outline',
  recovery: 'moon-outline',
};
const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The active-day streak: the current streak (counted up as the page opens), the best, totals, the next milestone,
 * a commit-graph style grid of the last weeks (tap a day to see what was recorded) and what counts. Only days the
 * user recorded something; nothing is scored.
 */
@Component({
  selector: 'app-streak',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <div class="toolbar">
          <button type="button" class="icon-button" aria-label="Back to home" (click)="back()">
            <ion-icon name="chevron-back" aria-hidden="true" />
          </button>
        </div>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main class="body">
        <h1 class="visually-hidden">Your streak</h1>
        @if (view(); as v) {
          <section class="hero" aria-labelledby="streak-current" data-testid="streak-hero">
            <span class="flame" [class.lit]="v.summary.current > 0" aria-hidden="true">🔥</span>
            <p class="count" id="streak-current">
              <span class="number" data-testid="streak-current" aria-hidden="true">{{ shown() }}</span>
              <span class="visually-hidden">{{ v.summary.current }}</span>
              <span class="count-label">day streak</span>
            </p>
            <p class="message" data-testid="streak-message">{{ v.message }}</p>
            @if (v.summary.nextMilestone; as next) {
              <div class="milestone" data-testid="streak-next">
                <div class="milestone-text">
                  <span>{{ next - v.summary.current }} more {{ next - v.summary.current === 1 ? 'day' : 'days' }} to a {{ next }}-day streak</span>
                </div>
                <span class="track" aria-hidden="true"><span class="fill" [style.width.%]="(v.summary.current / next) * 100"></span></span>
              </div>
            }
          </section>

          <dl class="stats" data-testid="streak-stats">
            <div class="stat"><dt>Current</dt><dd>{{ v.summary.current }}<span> days</span></dd></div>
            <div class="stat best"><dt>Best streak</dt><dd>{{ v.summary.best }}<span> days</span></dd></div>
            <div class="stat"><dt>Active days</dt><dd>{{ v.summary.activeDays }}</dd></div>
            <div class="stat"><dt>This month</dt><dd>{{ v.summary.thisMonth }}</dd></div>
          </dl>

          <section class="card" aria-labelledby="streak-grid-title">
            <h2 class="card-title" id="streak-grid-title">Last {{ v.grid.weeks.length }} weeks</h2>
            <app-streak-grid [grid]="v.grid" [kindLabels]="labels" />
          </section>

          <section class="card" aria-labelledby="streak-milestones-title">
            <h2 class="card-title" id="streak-milestones-title">Milestones</h2>
            <ul class="badges" data-testid="streak-badges">
              @for (m of milestones; track m) {
                <li class="badge" [class.reached]="v.summary.reached.includes(m)">
                  <span class="badge-icon" aria-hidden="true">{{ v.summary.reached.includes(m) ? '🏅' : '🔒' }}</span>
                  <span class="badge-days">{{ m }}</span>
                  <span class="visually-hidden">{{ m }}-day streak {{ v.summary.reached.includes(m) ? 'reached' : 'not reached yet' }}</span>
                </li>
              }
            </ul>
          </section>

          <section class="card" aria-labelledby="streak-counts-title">
            <h2 class="card-title" id="streak-counts-title">What keeps it going</h2>
            <p class="note">A day counts when you record any of these. Rest days count too, if you log food or a check-in.</p>
            <ul class="kinds">
              @for (kind of kinds; track kind) {
                <li><ion-icon [name]="icons[kind]" aria-hidden="true" />{{ labels[kind] }}</li>
              }
            </ul>
          </section>
        } @else if (data.error()) {
          <section class="card">
            <p class="note">Your streak couldn't be read right now.</p>
            <button fit-button type="button" variant="secondary" (click)="data.reload()">Try again</button>
          </section>
        } @else {
          <div aria-busy="true" class="loading">
            <span class="visually-hidden">Loading your streak</span>
            <fit-skeleton height="220px" radius="card" />
            <fit-skeleton height="120px" radius="card" />
          </div>
        }
      </main>
    </ion-content>
  `,
  styleUrl: './streak.page.scss',
  imports: [IonHeader, IonToolbar, IonContent, IonIcon, FitnessButtonComponent, LoadingSkeletonComponent, StreakGridComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'fit-theme-dashboard' },
})
export class StreakPage {
  private readonly streaks = inject(ActivityStreakService);
  private readonly nav = inject(NavController);

  protected readonly data = resource({ loader: () => this.streaks.activity() });
  protected readonly view = computed(() => {
    if (!this.data.hasValue()) {
      return null;
    }
    const today = this.streaks.today();
    const days = this.data.value();
    const summary = streakSummary(days, today);
    const message = summary.todayActive
      ? 'You kept it going today. See you tomorrow!'
      : summary.current > 0
        ? 'Record anything today to keep your streak going.'
        : 'Record anything today to start a new streak.';
    return { summary, grid: activityGrid(days, today), message };
  });

  /** The current streak, counted up from 0 as the page opens (shown at once with reduced motion). */
  protected readonly shown = signal(0);

  protected readonly milestones = STREAK_MILESTONES;
  protected readonly kinds = ACTIVITY_KINDS;
  protected readonly labels = KIND_LABELS;
  protected readonly icons = KIND_ICONS;

  constructor() {
    const destroyRef = inject(DestroyRef);
    effect((onCleanup) => {
      const target = this.view()?.summary.current ?? 0;
      if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function' || target === 0) {
        this.shown.set(target);
        return;
      }
      const started = performance.now();
      const duration = Math.min(1200, 400 + target * 40);
      let frame = 0;
      const tick = (now: number) => {
        const t = Math.min(1, (now - started) / duration);
        this.shown.set(Math.round(target * (1 - Math.pow(1 - t, 3))));
        if (t < 1) {
          frame = requestAnimationFrame(tick);
        }
      };
      frame = requestAnimationFrame(tick);
      onCleanup(() => cancelAnimationFrame(frame));
    });
    destroyRef.onDestroy(() => undefined);
  }

  protected back(): void {
    void this.nav.navigateBack('/home');
  }
}
