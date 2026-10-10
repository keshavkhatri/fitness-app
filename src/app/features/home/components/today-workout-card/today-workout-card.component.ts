import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessButtonComponent, FitnessCardComponent, FitnessProgressComponent } from '../../../../shared/ui';
import { WORKOUT_COPY } from '../../../workout/workout-content';
import { HomeWorkoutView } from '../../home-training';

/** Exercise names shown before "+N more". */
const SHOWN_EXERCISES = 2;

/**
 * Today's workout as Home's one ink (hero) surface: the planned session with
 * Start, the workout in progress with Resume, a rest day, or first-run setup.
 * Presentational only.
 */
@Component({
  selector: 'app-today-workout-card',
  template: `
    @let w = workout();
    <fit-card tone="ink" [attr.data-kind]="w.kind">
      <svg class="arcs" viewBox="0 0 210 210" aria-hidden="true">
        <circle cx="105" cy="105" r="90" stroke-opacity=".28" stroke-dasharray="380 566" />
        <circle cx="105" cy="105" r="64" stroke-opacity=".16" stroke-dasharray="300 402" />
        <circle cx="105" cy="105" r="38" stroke-opacity=".08" stroke-dasharray="180 239" />
      </svg>
      <div class="content">
        @switch (w.kind) {
          @case ('resume') {
            <p class="eyebrow"><ion-icon name="play" aria-hidden="true" />{{ copy.resume.eyebrow }}</p>
            <h2 class="name">{{ w.title }}</h2>
            <fit-progress class="sets" label="Sets done" [value]="w.setsDone" [max]="w.setsTotal || 1" [valueText]="w.progress" />
            <p class="focus" data-testid="home-workout-progress">{{ w.progress }}</p>
            <button
              fit-button
              type="button"
              variant="on-ink"
              size="lg"
              block
              icon="play"
              class="cta"
              [attr.aria-label]="'Resume ' + w.title"
              (click)="resumeSession.emit(w.sessionId)"
            >
              Resume
            </button>
          }
          @case ('resistance') {
            <div class="top">
              <p class="eyebrow"><ion-icon name="barbell-outline" aria-hidden="true" />{{ copy.today.workoutEyebrow }}</p>
              <span class="chip">{{ w.descriptor }}</span>
            </div>
            <h2 class="name">{{ w.title }}</h2>
            <ul class="meta">
              <li><ion-icon name="list-outline" aria-hidden="true" />{{ w.countLabel }}</li>
              <li><ion-icon name="time-outline" aria-hidden="true" />{{ w.durationLabel }}</li>
            </ul>
            @if (w.exercises.length) {
              <ul class="exercises" aria-label="First exercises" data-testid="home-workout-exercises">
                @for (name of shownExercises(); track $index) {
                  <li>{{ name }}</li>
                }
                @if (moreExercises(); as more) {
                  <li class="more">+{{ more }} more</li>
                }
              </ul>
            }
            @if (statusMessage(); as message) {
              <p class="status" role="status">{{ message }}</p>
            }
            <button
              fit-button
              type="button"
              variant="on-ink"
              size="lg"
              block
              icon="play"
              class="cta"
              [loading]="starting()"
              [disabled]="starting()"
              (click)="startSession.emit(w.sessionId)"
            >
              Start workout
            </button>
          }
          @case ('activity') {
            <p class="eyebrow"><ion-icon name="walk-outline" aria-hidden="true" />{{ copy.today.activityEyebrow }}</p>
            <h2 class="name">{{ w.title }}</h2>
            <p class="focus">{{ w.summary }}</p>
            <button fit-button type="button" variant="ghost-ink" size="lg" block class="cta" (click)="openSession.emit(w.sessionId)">
              {{ copy.today.viewActivity }}
            </button>
          }
          @case ('rest') {
            <p class="eyebrow"><ion-icon name="moon-outline" aria-hidden="true" />{{ copy.today.restEyebrow }}</p>
            <h2 class="name">{{ copy.today.restTitle }}</h2>
            <p class="focus">{{ w.message }}</p>
            @if (w.upNext; as next) {
              <p class="next" data-testid="home-workout-next">{{ next }}</p>
            }
            <button fit-button type="button" variant="ghost-ink" size="lg" block icon="chevron-forward" class="cta" (click)="openPlan.emit()">
              View plan
            </button>
          }
          @case ('no-profile') {
            <p class="eyebrow"><ion-icon name="sparkles-outline" aria-hidden="true" />Get started</p>
            <h2 class="name">Let’s build your plan</h2>
            <p class="focus">Tell us about you and your goal. We’ll create your training plan and daily targets.</p>
            <ol class="steps">
              <li><span class="step-number" aria-hidden="true">1</span>Your profile</li>
              <li><span class="step-number" aria-hidden="true">2</span>Your assessment</li>
              <li><span class="step-number" aria-hidden="true">3</span>Your weekly plan</li>
            </ol>
            <button fit-button type="button" variant="on-ink" size="lg" block icon="chevron-forward" class="cta" (click)="setUpProfile.emit()">
              Set up profile
            </button>
          }
          @default {
            <p class="eyebrow"><ion-icon name="barbell-outline" aria-hidden="true" />{{ copy.today.workoutEyebrow }}</p>
            <h2 class="name">Plan unavailable</h2>
            <p class="focus">We couldn’t create a training plan from your profile right now.</p>
            <button fit-button type="button" variant="ghost-ink" size="lg" block class="cta" (click)="openPlan.emit()">Open Workout</button>
          }
        }
      </div>
    </fit-card>
  `,
  styleUrl: './today-workout-card.component.scss',
  imports: [IonIcon, FitnessButtonComponent, FitnessCardComponent, FitnessProgressComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodayWorkoutCardComponent {
  readonly workout = input.required<HomeWorkoutView>();
  /** A start is in flight (the button shows a spinner). */
  readonly starting = input(false, { transform: booleanAttribute });
  /** Shown above Start, e.g. when a start failed. Announced. */
  readonly statusMessage = input('');
  /** Plan session id → start it now (Home starts the workout directly). */
  readonly startSession = output<string>();
  /** Plan session id → Workout Detail (activities). */
  readonly openSession = output<string>();
  /** Plan session id of the workout in progress → Active Workout. */
  readonly resumeSession = output<string>();
  /** The Workout tab (rest days, no plan). */
  readonly openPlan = output<void>();
  /** No profile yet: start onboarding. */
  readonly setUpProfile = output<void>();

  protected readonly copy = WORKOUT_COPY;

  private readonly exercises = computed(() => {
    const w = this.workout();
    return w.kind === 'resistance' ? w.exercises : [];
  });
  protected readonly shownExercises = computed(() => this.exercises().slice(0, SHOWN_EXERCISES));
  protected readonly moreExercises = computed(() => Math.max(this.exercises().length - SHOWN_EXERCISES, 0));
}
