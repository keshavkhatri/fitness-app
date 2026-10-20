import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessButtonComponent, FitnessCardComponent, FitnessProgressComponent } from '../../../../shared/ui';
import { WORKOUT_COPY } from '../../../workout/workout-content';
import { sessionIdPhoto } from '../../../workout/workout-photos';
import { FEATURED_WORKOUT_PHOTO } from '../../home-media';
import { HomeWorkoutView } from '../../home-training';
import { WorkoutArtComponent } from '../workout-art/workout-art.component';

/**
 * Home's featured card, its one ink (hero) surface: today's planned session
 * with Start, the workout in progress with Resume, an activity or rest day,
 * or first-run setup. Every state has exactly one lime primary action.
 * Presentational only.
 */
@Component({
  selector: 'app-today-workout-card',
  template: `
    @let w = workout();
    <fit-card tone="ink" padding="none" [attr.data-kind]="w.kind">
      <div class="media" aria-hidden="true">
        @if (photo; as src) {
          <img class="photo" [src]="src" alt="" />
        } @else {
          <app-workout-art [seed]="seed()" [photo]="sessionPhoto()" />
        }
        <div class="scrim"></div>
      </div>

      <div class="content">
        @switch (w.kind) {
          @case ('resume') {
            <p class="eyebrow"><ion-icon name="play" aria-hidden="true" />{{ copy.resume.eyebrow }}</p>
            <div class="bottom">
              <h2 class="name">{{ w.title }}</h2>
              <p class="focus" data-testid="home-workout-progress">{{ w.progress }}</p>
              <fit-progress class="sets" label="Sets done" [value]="w.setsDone" [max]="w.setsTotal || 1" [valueText]="w.progress" />
              <button fit-button type="button" class="cta" [attr.aria-label]="'Resume ' + w.title" (click)="resumeSession.emit(w.sessionId)">
                Resume<ion-icon name="chevron-forward" aria-hidden="true" />
              </button>
            </div>
          }
          @case ('resistance') {
            <p class="eyebrow"><ion-icon class="star" name="star" aria-hidden="true" />Recommended</p>
            <div class="bottom">
              <h2 class="name">{{ w.title }}</h2>
              <ul class="meta">
                <li><ion-icon name="time-outline" aria-hidden="true" />{{ w.minutes }} min</li>
                <li><ion-icon name="apps-outline" aria-hidden="true" />{{ w.countLabel }}</li>
              </ul>
              @if (areas().length) {
                <ul class="areas" aria-label="Focus" data-testid="home-workout-areas">
                  @for (area of areas(); track area) {
                    <li>{{ area }}</li>
                  }
                </ul>
              }
              @if (statusMessage(); as message) {
                <p class="status" role="status">{{ message }}</p>
              }
              <button fit-button type="button" class="cta" [loading]="starting()" [disabled]="starting()" (click)="startSession.emit(w.sessionId)">
                Start workout<ion-icon name="chevron-forward" aria-hidden="true" />
              </button>
            </div>
          }
          @case ('activity') {
            <p class="eyebrow"><ion-icon name="walk-outline" aria-hidden="true" />{{ copy.today.activityEyebrow }}</p>
            <div class="bottom">
              <h2 class="name">{{ w.title }}</h2>
              <p class="focus">{{ w.summary }}</p>
              <button fit-button type="button" class="cta" (click)="openSession.emit(w.sessionId)">
                {{ copy.today.viewActivity }}<ion-icon name="chevron-forward" aria-hidden="true" />
              </button>
            </div>
          }
          @case ('rest') {
            <p class="eyebrow"><ion-icon name="moon-outline" aria-hidden="true" />{{ copy.today.restEyebrow }}</p>
            <div class="bottom">
              <h2 class="name">{{ copy.today.restTitle }}</h2>
              @if (w.upNext; as next) {
                <p class="focus" data-testid="home-workout-next">{{ next }}</p>
              } @else {
                <p class="focus">{{ w.message }}</p>
              }
              <button fit-button type="button" class="cta" (click)="openPlan.emit()">
                View plan<ion-icon name="chevron-forward" aria-hidden="true" />
              </button>
            </div>
          }
          @case ('no-profile') {
            <p class="eyebrow"><ion-icon name="sparkles-outline" aria-hidden="true" />Get started</p>
            <div class="bottom">
              <h2 class="name">Let’s build your plan</h2>
              <p class="focus">Your profile, your assessment, then your weekly plan.</p>
              <button fit-button type="button" class="cta" (click)="setUpProfile.emit()">
                Set up profile<ion-icon name="chevron-forward" aria-hidden="true" />
              </button>
            </div>
          }
          @default {
            <p class="eyebrow"><ion-icon name="barbell" aria-hidden="true" />{{ copy.today.workoutEyebrow }}</p>
            <div class="bottom">
              <h2 class="name">Plan unavailable</h2>
              <p class="focus">We couldn’t create a training plan from your profile right now.</p>
              <button fit-button type="button" class="cta" (click)="openPlan.emit()">
                Open workout<ion-icon name="chevron-forward" aria-hidden="true" />
              </button>
            </div>
          }
        }
      </div>
    </fit-card>
  `,
  styleUrl: './today-workout-card.component.scss',
  imports: [IonIcon, FitnessButtonComponent, FitnessCardComponent, FitnessProgressComponent, WorkoutArtComponent],
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

  /** A photo when one is configured, else the generated placeholder. */
  protected readonly photo = FEATURED_WORKOUT_PHOTO;
  /** The session's photo (by its type); the generated art without one. */
  protected readonly sessionPhoto = computed(() => {
    const w = this.workout();
    return 'sessionId' in w ? sessionIdPhoto(w.sessionId) : null;
  });
  protected readonly seed = computed(() => {
    const w = this.workout();
    return 'sessionId' in w ? w.sessionId : w.kind;
  });
  /** Up to three body areas, as chips. */
  protected readonly areas = computed(() => {
    const w = this.workout();
    return w.kind === 'resistance' ? w.focusAreas.slice(0, MAX_AREAS) : [];
  });
}

const MAX_AREAS = 3;
