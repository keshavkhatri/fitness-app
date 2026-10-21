import { ChangeDetectionStrategy, Component, computed, effect, input, model, output, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { REST_SECONDS_LIMITS } from '../../../domain/workout-session';
import { BottomSheetComponent, FitnessButtonComponent } from '../../../shared/ui';
import { WORKOUT_COPY } from '../workout-content';
import { formatClock } from './rest-timer';

export interface RestChoice {
  /** Whole seconds, or null for "back to the planned rest". */
  readonly seconds: number | null;
  /** Apply to every exercise of the workout, not just this one. */
  readonly all: boolean;
}

const PRESETS = [30, 60, 90, 120, 180] as const;

/**
 * Lets the user pick their own rest between sets: a 15-second stepper, a few
 * quick choices, and whether it is for this exercise or all of them.
 * Presentational: the page saves the choice.
 */
@Component({
  selector: 'app-rest-duration-sheet',
  template: `
    <fit-bottom-sheet [title]="copy.title" [description]="copy.forExercise(exerciseName())" screenTheme="immersive" [(open)]="open">
      <div class="picker" data-testid="rest-sheet">
        <div class="stepper">
          <button type="button" class="step" data-testid="rest-less" [attr.aria-label]="copy.less" [disabled]="draft() <= limits.min" (click)="nudge(-limits.step)">
            <ion-icon name="remove" aria-hidden="true" />
          </button>
          <p class="value" data-testid="rest-draft" role="status" aria-live="polite">
            <span aria-hidden="true">{{ clock() }}</span>
            <span class="visually-hidden">{{ copy.value(clock()) }}</span>
          </p>
          <button type="button" class="step" data-testid="rest-more" [attr.aria-label]="copy.more" [disabled]="draft() >= limits.max" (click)="nudge(limits.step)">
            <ion-icon name="add" aria-hidden="true" />
          </button>
        </div>

        <ul class="presets" [attr.aria-label]="copy.presets">
          @for (seconds of presets; track seconds) {
            <li>
              <button type="button" class="preset" [attr.aria-pressed]="draft() === seconds" [attr.data-testid]="'rest-preset-' + seconds" (click)="draft.set(seconds)">
                {{ format(seconds) }}
              </button>
            </li>
          }
        </ul>

        <label class="all">
          <input type="checkbox" data-testid="rest-all" [checked]="all()" (change)="all.set(!all())" />
          <span>{{ copy.all }}</span>
        </label>

        @if (running()) {
          <p class="note">{{ copy.restartNote }}</p>
        }

        <div class="actions">
          <button fit-button type="button" size="lg" block data-testid="rest-save" (click)="save()">{{ copy.save }}</button>
          @if (hasCustom() || draft() !== plannedSeconds()) {
            <button fit-button type="button" size="lg" block variant="ghost" data-testid="rest-planned" (click)="usePlanned()">
              {{ copy.usePlanned(format(plannedSeconds())) }}
            </button>
          }
        </div>
      </div>
    </fit-bottom-sheet>
  `,
  styleUrl: './rest-duration-sheet.component.scss',
  imports: [IonIcon, BottomSheetComponent, FitnessButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestDurationSheetComponent {
  readonly open = model(false);
  readonly exerciseName = input.required<string>();
  /** The rest in force now. */
  readonly seconds = input.required<number>();
  readonly plannedSeconds = input.required<number>();
  /** A rest is counting down: saving restarts it with the new length. */
  readonly running = input(false);

  readonly chosen = output<RestChoice>();

  protected readonly copy = WORKOUT_COPY.active.rest.sheet;
  protected readonly limits = REST_SECONDS_LIMITS;
  protected readonly presets = PRESETS;
  protected readonly draft = signal<number>(REST_SECONDS_LIMITS.min);
  protected readonly all = signal(false);
  protected readonly clock = computed(() => formatClock(this.draft()));
  protected readonly hasCustom = computed(() => this.seconds() !== this.plannedSeconds());

  constructor() {
    // Each time the sheet opens it starts from the rest in force.
    effect(() => {
      if (this.open()) {
        this.draft.set(this.clamp(this.seconds()));
        this.all.set(false);
      }
    });
  }

  protected format(seconds: number): string {
    return formatClock(seconds);
  }

  protected nudge(delta: number): void {
    this.draft.update((value) => this.clamp(value + delta));
  }

  protected save(): void {
    this.chosen.emit({ seconds: this.draft(), all: this.all() });
    this.open.set(false);
  }

  protected usePlanned(): void {
    this.chosen.emit({ seconds: null, all: this.all() });
    this.open.set(false);
  }

  private clamp(value: number): number {
    return Math.min(REST_SECONDS_LIMITS.max, Math.max(REST_SECONDS_LIMITS.min, Math.round(value)));
  }
}
