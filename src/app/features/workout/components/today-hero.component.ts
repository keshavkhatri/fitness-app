import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessButtonComponent, FitnessChipComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { DayView } from '../workout-view-model';

const ICONS = { resistance: 'barbell-outline', activity: 'walk-outline', rest: 'moon-outline' } as const;

/**
 * Today at a glance: a resistance workout or activity day (opening its
 * detail) or a rest day (no workout CTA; optionally preview the next session).
 * Presentational only.
 */
@Component({
  selector: 'app-today-hero',
  template: `
    @let s = day().session;
    <section class="hero" [attr.data-kind]="s.kind" aria-labelledby="workout-today-heading">
      <div class="top">
        <div class="heading-group">
          <h2 class="eyebrow" id="workout-today-heading">
            @switch (s.kind) {
              @case ('resistance') {
                {{ copy.workoutEyebrow }}
              }
              @case ('activity') {
                {{ copy.activityEyebrow }}
              }
              @default {
                {{ copy.restEyebrow }}
              }
            }
          </h2>
          <p class="title" data-testid="today-title">{{ s.title }}</p>
        </div>
        <span class="icon" aria-hidden="true"><ion-icon [name]="icons[s.kind]" /></span>
      </div>

      @switch (s.kind) {
        @case ('resistance') {
          <div class="details">
            <fit-chip tone="primary">{{ s.descriptor }}</fit-chip>
            <ul class="meta" data-testid="today-meta">
              <li><ion-icon name="barbell-outline" aria-hidden="true" />{{ s.countLabel }}</li>
              <li><ion-icon name="time-outline" aria-hidden="true" />{{ s.durationLabel }}</li>
            </ul>
          </div>
          <button fit-button type="button" size="lg" block icon="chevron-forward" (click)="openSession.emit(day())">
            {{ copy.viewWorkout }}
          </button>
        }
        @case ('activity') {
          <div class="details">
            <p class="summary" data-testid="today-meta">{{ s.summary }}</p>
            <p class="message">{{ s.suggestions }}</p>
          </div>
          <button fit-button type="button" size="lg" block variant="secondary" (click)="openSession.emit(day())">
            {{ copy.viewActivity }}
          </button>
        }
        @default {
          <div class="details">
            <p class="message">{{ copy.restMessage }}</p>
            @if (upNext(); as next) {
              <p class="summary" data-testid="up-next">{{ copy.upNext(next.session.title, next.weekday) }}</p>
            }
          </div>
          @if (upNext(); as next) {
            <button fit-button type="button" variant="outline" block (click)="openSession.emit(next)">
              {{ copy.preview(next.session.title) }}
            </button>
          }
        }
      }
    </section>
  `,
  styleUrl: './today-hero.component.scss',
  imports: [IonIcon, FitnessButtonComponent, FitnessChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodayHeroComponent {
  readonly day = input.required<DayView>();
  readonly upNext = input<DayView | null>(null);

  /** Open a training day's Workout Detail. */
  readonly openSession = output<DayView>();

  protected readonly copy = WORKOUT_COPY.today;
  protected readonly icons = ICONS;
}
