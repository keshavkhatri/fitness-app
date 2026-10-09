import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessButtonComponent, FitnessCardComponent } from '../../../../shared/ui';
import { WORKOUT_COPY } from '../../../workout/workout-content';
import { HomeWorkoutView } from '../../home-training';

/** Today's planned session on Home (or the workout in progress). Presentational only. */
@Component({
  selector: 'app-today-workout-card',
  template: `
    @let w = workout();
    <fit-card [attr.data-kind]="w.kind">
      @switch (w.kind) {
        @case ('resume') {
          <p class="eyebrow">{{ copy.resume.eyebrow }}</p>
          <h3 class="name">{{ w.title }}</h3>
          <p class="focus" data-testid="home-workout-progress">{{ w.progress }}</p>
          <button fit-button type="button" block icon="play-outline" class="cta" (click)="resumeSession.emit(w.sessionId)">
            {{ copy.resume.action }}
          </button>
        }
        @case ('resistance') {
          <h3 class="name">{{ w.title }}</h3>
          <p class="focus">{{ w.descriptor }}</p>
          <ul class="meta">
            <li><ion-icon name="barbell-outline" aria-hidden="true" />{{ w.countLabel }}</li>
            <li><ion-icon name="time-outline" aria-hidden="true" />{{ w.durationLabel }}</li>
          </ul>
          <button fit-button type="button" block icon="chevron-forward" (click)="openSession.emit(w.sessionId)">
            {{ copy.today.viewWorkout }}
          </button>
        }
        @case ('activity') {
          <h3 class="name">{{ w.title }}</h3>
          <p class="focus">{{ w.summary }}</p>
          <button fit-button type="button" block variant="secondary" class="cta" (click)="openSession.emit(w.sessionId)">
            {{ copy.today.viewActivity }}
          </button>
        }
        @case ('rest') {
          <h3 class="name">{{ copy.today.restTitle }}</h3>
          <p class="focus">{{ w.message }}</p>
          @if (w.upNext; as next) {
            <p class="next" data-testid="home-workout-next">{{ next }}</p>
          }
          <button fit-button type="button" block variant="outline" class="cta" (click)="openPlan.emit()">View plan</button>
        }
        @case ('no-profile') {
          <h3 class="name">No plan yet</h3>
          <p class="focus">Set up your profile to get a training plan.</p>
          <button fit-button type="button" block variant="outline" class="cta" (click)="openPlan.emit()">Open Workout</button>
        }
        @default {
          <h3 class="name">Plan unavailable</h3>
          <p class="focus">We couldn't create a training plan from your profile right now.</p>
          <button fit-button type="button" block variant="outline" class="cta" (click)="openPlan.emit()">Open Workout</button>
        }
      }
    </fit-card>
  `,
  styleUrl: './today-workout-card.component.scss',
  imports: [IonIcon, FitnessButtonComponent, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodayWorkoutCardComponent {
  readonly workout = input.required<HomeWorkoutView>();
  /** Plan session id → Workout Detail. */
  readonly openSession = output<string>();
  /** Plan session id of the workout in progress → Active Workout. */
  readonly resumeSession = output<string>();
  /** The Workout tab (rest days, no plan). */
  readonly openPlan = output<void>();

  protected readonly copy = WORKOUT_COPY;
}
