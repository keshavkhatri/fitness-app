import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessButtonComponent, FitnessCardComponent, FitnessProgressComponent } from '../../../../shared/ui';
import { WORKOUT_COPY } from '../../../workout/workout-content';
import { HomeWorkoutView } from '../../home-training';

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
      <!-- No exercise photography ships with the app (see docs/design-system.md): a graphic stands in. -->
      <div class="art" aria-hidden="true">
        <svg class="arcs" viewBox="0 0 210 210">
          <circle cx="105" cy="105" r="90" stroke-opacity=".32" stroke-dasharray="380 566" />
          <circle cx="105" cy="105" r="64" stroke-opacity=".18" stroke-dasharray="300 402" />
          <circle cx="105" cy="105" r="38" stroke-opacity=".1" stroke-dasharray="180 239" />
        </svg>
        <ion-icon class="glyph" [name]="glyph()" />
      </div>
      <div class="content">
        @switch (w.kind) {
          @case ('resume') {
            <p class="eyebrow"><ion-icon name="play" aria-hidden="true" />{{ copy.resume.eyebrow }}</p>
            <h2 class="name">{{ w.title }}</h2>
            <p class="focus" data-testid="home-workout-progress">{{ w.progress }}</p>
            <fit-progress class="sets" label="Sets done" [value]="w.setsDone" [max]="w.setsTotal || 1" [valueText]="w.progress" />
            <div class="actions">
              <button
                fit-button
                type="button"
                size="lg"
                class="cta"
                [attr.aria-label]="'Resume ' + w.title"
                (click)="resumeSession.emit(w.sessionId)"
              >
                Resume<ion-icon name="chevron-forward" aria-hidden="true" />
              </button>
            </div>
          }
          @case ('resistance') {
            <p class="eyebrow"><ion-icon name="barbell" aria-hidden="true" />{{ copy.today.workoutEyebrow }}</p>
            <h2 class="name">{{ w.title }}</h2>
            <ul class="meta">
              <li><ion-icon name="time-outline" aria-hidden="true" />{{ w.durationLabel }}</li>
              <li><ion-icon name="list-outline" aria-hidden="true" />{{ w.countLabel }}</li>
            </ul>
            @if (statusMessage(); as message) {
              <p class="status" role="status">{{ message }}</p>
            }
            <div class="actions">
              @if (w.focusAreas.length) {
                <ul class="areas" aria-label="Focus" data-testid="home-workout-areas">
                  @for (area of w.focusAreas; track area) {
                    <li>{{ area }}</li>
                  }
                </ul>
              }
              <button fit-button type="button" size="lg" class="cta" [loading]="starting()" [disabled]="starting()" (click)="startSession.emit(w.sessionId)">
                Start workout<ion-icon name="chevron-forward" aria-hidden="true" />
              </button>
            </div>
          }
          @case ('activity') {
            <p class="eyebrow"><ion-icon name="walk-outline" aria-hidden="true" />{{ copy.today.activityEyebrow }}</p>
            <h2 class="name">{{ w.title }}</h2>
            <p class="focus">{{ w.summary }}</p>
            <div class="actions">
              <button fit-button type="button" size="lg" class="cta" (click)="openSession.emit(w.sessionId)">
                {{ copy.today.viewActivity }}<ion-icon name="chevron-forward" aria-hidden="true" />
              </button>
            </div>
          }
          @case ('rest') {
            <p class="eyebrow"><ion-icon name="moon-outline" aria-hidden="true" />{{ copy.today.restEyebrow }}</p>
            <h2 class="name">{{ copy.today.restTitle }}</h2>
            @if (w.upNext; as next) {
              <p class="focus" data-testid="home-workout-next">{{ next }}</p>
            } @else {
              <p class="focus">{{ w.message }}</p>
            }
            <div class="actions">
              <button fit-button type="button" size="lg" class="cta" (click)="openPlan.emit()">
                View plan<ion-icon name="chevron-forward" aria-hidden="true" />
              </button>
            </div>
          }
          @case ('no-profile') {
            <p class="eyebrow"><ion-icon name="sparkles-outline" aria-hidden="true" />Get started</p>
            <h2 class="name">Let’s build your plan</h2>
            <ol class="steps">
              <li><span class="step-number" aria-hidden="true">1</span>Your profile</li>
              <li><span class="step-number" aria-hidden="true">2</span>Your assessment</li>
              <li><span class="step-number" aria-hidden="true">3</span>Your weekly plan</li>
            </ol>
            <div class="actions">
              <button fit-button type="button" size="lg" class="cta" (click)="setUpProfile.emit()">
                Set up profile<ion-icon name="chevron-forward" aria-hidden="true" />
              </button>
            </div>
          }
          @default {
            <p class="eyebrow"><ion-icon name="barbell" aria-hidden="true" />{{ copy.today.workoutEyebrow }}</p>
            <h2 class="name">Plan unavailable</h2>
            <p class="focus">We couldn’t create a training plan from your profile right now.</p>
            <div class="actions">
              <button fit-button type="button" size="lg" class="cta" (click)="openPlan.emit()">
                Open Workout<ion-icon name="chevron-forward" aria-hidden="true" />
              </button>
            </div>
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

  /** The large background glyph, matching the state. */
  protected readonly glyph = computed(() => GLYPHS[this.workout().kind] ?? 'barbell');
}

const GLYPHS: Partial<Record<HomeWorkoutView['kind'], string>> = {
  activity: 'walk-outline',
  rest: 'moon-outline',
  'no-profile': 'sparkles-outline',
};
