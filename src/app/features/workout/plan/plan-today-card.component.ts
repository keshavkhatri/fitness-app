import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessButtonComponent, FitnessCardComponent, FitnessProgressComponent } from '../../../shared/ui';
import { WorkoutArtComponent } from '../../home/components/workout-art/workout-art.component';
import { WORKOUT_COPY } from '../workout-content';
import { PlanFeatureView } from './plan-view-model';

/**
 * The Workout tab's featured card (its one ink hero): today's session with
 * Start, the workout in progress with Resume, today's finished workout, an
 * activity or a rest day. One full-width lime action in every state.
 * Presentational only.
 */
@Component({
  selector: 'app-plan-today-card',
  template: `
    @let f = feature();
    <fit-card tone="ink" padding="none" [attr.data-kind]="f.kind" data-testid="plan-today">
      <div class="media" aria-hidden="true">
        <app-workout-art [seed]="seed()" [photo]="photo()" />
        <div class="scrim"></div>
      </div>

      <div class="content">
        @switch (f.kind) {
          @case ('resume') {
            <p class="eyebrow"><ion-icon name="play" aria-hidden="true" />{{ resumeCopy.eyebrow }}</p>
            <div class="bottom">
              <h2 class="name">{{ f.title }}</h2>
              <p class="line" data-testid="plan-today-progress">{{ f.progress }}</p>
              <fit-progress class="sets" label="Sets done" [value]="f.setsDone" [max]="f.setsTotal || 1" [valueText]="f.progress" />
              <button fit-button type="button" class="cta" icon="play" block (click)="resumeSession.emit(f.sessionId)">{{ copy.resume }}</button>
            </div>
          }
          @case ('activity') {
            <p class="eyebrow"><ion-icon name="walk-outline" aria-hidden="true" />{{ todayCopy.activityEyebrow }}</p>
            <div class="bottom">
              <h2 class="name">{{ f.title }}</h2>
              <p class="line">{{ f.summary }}</p>
              <button fit-button type="button" class="cta" block (click)="openSession.emit(f.sessionId)">{{ copy.viewActivity }}</button>
            </div>
          }
          @case ('rest') {
            <p class="eyebrow"><ion-icon name="moon-outline" aria-hidden="true" />{{ copy.today }}</p>
            <div class="bottom">
              <h2 class="name">{{ todayCopy.restTitle }}</h2>
              <p class="line" data-testid="plan-today-next">{{ f.upNext ?? todayCopy.restMessage }}</p>
              <button fit-button type="button" class="cta" block (click)="openWeek.emit()">{{ copy.viewPlan }}</button>
            </div>
          }
          @default {
            <p class="eyebrow">
              <ion-icon [name]="f.kind === 'done' ? 'checkmark-circle' : 'flash'" aria-hidden="true" />{{ f.kind === 'done' ? copy.doneEyebrow : copy.todayEyebrow }}
            </p>
            <div class="bottom">
              <h2 class="name">{{ f.title }}</h2>
              <ul class="meta">
                <li><ion-icon name="time-outline" aria-hidden="true" /><span class="visually-hidden">About </span>{{ f.minutes }} min</li>
                <li><ion-icon name="apps-outline" aria-hidden="true" />{{ f.countLabel }}</li>
              </ul>
              @if (f.areas.length) {
                <ul class="areas" [attr.aria-label]="copy.focus" data-testid="plan-today-areas">
                  @for (area of f.areas; track area) {
                    <li>{{ area }}</li>
                  }
                </ul>
              }
              @if (statusMessage(); as message) {
                <p class="status" role="status">{{ message }}</p>
              }
              @if (f.kind === 'done') {
                <button fit-button type="button" class="cta" icon="checkmark" block (click)="openRecord.emit(f.workoutId)">{{ copy.viewRecord }}</button>
              } @else {
                <button
                  fit-button
                  type="button"
                  class="cta"
                  icon="play"
                  block
                  [loading]="starting()"
                  [disabled]="starting()"
                  (click)="startSession.emit(f.sessionId)"
                >
                  {{ copy.start }}
                </button>
              }
            </div>
          }
        }
      </div>
    </fit-card>
  `,
  styleUrl: './plan-today-card.component.scss',
  imports: [IonIcon, FitnessButtonComponent, FitnessCardComponent, FitnessProgressComponent, WorkoutArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanTodayCardComponent {
  readonly feature = input.required<PlanFeatureView>();
  /** A start is in flight (the button shows a spinner). */
  readonly starting = input(false, { transform: booleanAttribute });
  /** Shown above Start, e.g. when a start failed. Announced. */
  readonly statusMessage = input('');
  readonly startSession = output<string>();
  readonly resumeSession = output<string>();
  /** Plan session id → Workout Detail (activities). */
  readonly openSession = output<string>();
  /** Finished workout id → its history record. */
  readonly openRecord = output<string>();
  /** Rest day: the week's sessions below. */
  readonly openWeek = output<void>();

  protected readonly copy = WORKOUT_COPY.planTab;
  protected readonly todayCopy = WORKOUT_COPY.today;
  protected readonly resumeCopy = WORKOUT_COPY.resume;
  protected readonly photo = computed(() => {
    const f = this.feature();
    return 'photo' in f ? f.photo : null;
  });
  protected readonly seed = computed(() => {
    const f = this.feature();
    return 'sessionId' in f ? f.sessionId : f.kind;
  });
}
