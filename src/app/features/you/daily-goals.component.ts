import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { GoalsService } from '../../core/goals/goals.service';
import { WaterLogService } from '../../core/nutrition/water-log.service';
import { STEP_GOAL_RANGE, WATER_GOAL_RANGE_ML, nudgeGoal } from '../../domain/daily-check-in';
import { formatWater } from '../nutrition/nutrition-water';

const NUMBER = new Intl.NumberFormat('en-US');

/**
 * Settings › Daily goals: steps and water. Each starts as the app's suggestion (10,000 steps; water from body
 * weight) and the person can move it with − and + (500 steps; one glass of water). "Use suggested goals" goes back.
 * Water is shown in the person's units (litres or fluid ounces); it is stored in millilitres.
 */
@Component({
  selector: 'app-daily-goals',
  template: `
    <section class="card" aria-labelledby="settings-goals" data-testid="daily-goals">
      <h2 class="setting-title" id="settings-goals">Daily goals</h2>

      <div class="goal">
        <div class="text">
          <span class="label" id="goal-steps-label">Steps</span>
          <span class="hint" data-testid="goal-steps-hint">{{ goals.goals().steps === null ? 'Suggested' : 'Your goal' }}</span>
        </div>
        <div class="stepper" role="group" aria-labelledby="goal-steps-label">
          <button type="button" aria-label="Lower the step goal" data-testid="goal-steps-less" [disabled]="busy() || steps() <= stepRange.min" (click)="nudgeSteps(-1)">
            <ion-icon name="remove" aria-hidden="true" />
          </button>
          <span class="value" data-testid="goal-steps-value" aria-live="polite">{{ stepsText() }}</span>
          <button type="button" aria-label="Raise the step goal" data-testid="goal-steps-more" [disabled]="busy() || steps() >= stepRange.max" (click)="nudgeSteps(1)">
            <ion-icon name="add" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="goal">
        <div class="text">
          <span class="label" id="goal-water-label">Water</span>
          <span class="hint" data-testid="goal-water-hint">{{ goals.waterOverrideMl() === null ? 'Suggested from your weight' : 'Your goal' }}</span>
        </div>
        <div class="stepper" role="group" aria-labelledby="goal-water-label">
          <button type="button" aria-label="Lower the water goal" data-testid="goal-water-less" [disabled]="busy() || waterMl() === null || waterMl()! <= waterRange.min" (click)="nudgeWater(-1)">
            <ion-icon name="remove" aria-hidden="true" />
          </button>
          <span class="value" data-testid="goal-water-value" aria-live="polite">{{ waterText() }}</span>
          <button type="button" aria-label="Raise the water goal" data-testid="goal-water-more" [disabled]="busy() || waterMl() === null || waterMl()! >= waterRange.max" (click)="nudgeWater(1)">
            <ion-icon name="add" aria-hidden="true" />
          </button>
        </div>
      </div>

      @if (customised()) {
        <button type="button" class="reset" data-testid="goals-reset" [disabled]="busy()" (click)="reset()">Use suggested goals</button>
      }
      @if (error()) {
        <p class="error" role="alert" data-testid="goals-error">Couldn't save your goal. Try again.</p>
      }
    </section>
  `,
  styles: `
    @use 'mixins' as fx;

    .card {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }

    .setting-title {
      @include fx.text(body-sm, semibold);
    }

    .goal {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .label {
      @include fx.text(body, medium);
    }

    .hint {
      @include fx.text(caption);
      color: var(--color-text-secondary);
    }

    .stepper {
      display: flex;
      flex: none;
      align-items: center;
      gap: var(--space-2);
    }

    .stepper button {
      @include fx.button-reset;
      @include fx.focus-ring;

      display: grid;
      place-items: center;
      width: var(--tap-target-min);
      height: var(--tap-target-min);
      padding: 0;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
      color: var(--color-text);
      font-size: 20px;

      &:active:not(:disabled) {
        background: var(--color-primary-soft);
      }

      &:disabled {
        opacity: 0.4;
      }
    }

    .value {
      @include fx.text(body, bold);
      @include fx.tabular-numbers;
      min-width: 5.5em;
      text-align: center;
    }

    .reset {
      @include fx.button-reset;
      @include fx.focus-ring;
      @include fx.text(body-sm, semibold);

      align-self: flex-start;
      min-height: var(--tap-target-min);
      color: var(--color-primary-text);
    }

    .error {
      @include fx.text(body-sm, medium);
      color: var(--color-danger-text);
    }
  `,
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyGoalsComponent {
  protected readonly goals = inject(GoalsService);
  private readonly waterLog = inject(WaterLogService);

  protected readonly stepRange = STEP_GOAL_RANGE;
  protected readonly waterRange = WATER_GOAL_RANGE_ML;
  protected readonly steps = this.goals.stepGoal;
  /** The water goal in effect (ml): the person's, else the suggestion (needs the profile and weigh-ins, so it is read, not computed). */
  protected readonly waterMl = signal<number | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal(false);

  protected readonly stepsText = computed(() => NUMBER.format(this.steps()));
  protected readonly waterText = computed(() => {
    const ml = this.waterMl();
    return ml === null ? '–' : formatWater(ml, this.waterLog.unit());
  });
  protected readonly customised = computed(() => this.goals.goals().steps !== null || this.goals.waterOverrideMl() !== null);

  constructor() {
    // Read again when the units change (a suggested goal is rounded to glasses of the person's units).
    effect(() => {
      this.waterLog.unit();
      untracked(() => void this.refreshWater());
    });
  }

  protected nudgeSteps(direction: 1 | -1): Promise<void> {
    return this.save(() => this.goals.setSteps(nudgeGoal(this.steps(), direction, STEP_GOAL_RANGE.step, STEP_GOAL_RANGE)));
  }

  protected nudgeWater(direction: 1 | -1): Promise<void> {
    const current = this.waterMl();
    if (current === null) {
      return Promise.resolve();
    }
    return this.save(() => this.goals.setWaterMl(Math.round(nudgeGoal(current, direction, this.waterLog.glassMl(), WATER_GOAL_RANGE_ML))));
  }

  protected reset(): Promise<void> {
    return this.save(async () => {
      await this.goals.setSteps(null);
      await this.goals.setWaterMl(null);
    });
  }

  private async save(change: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(false);
    try {
      await change();
      await this.refreshWater();
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  private async refreshWater(): Promise<void> {
    const goal = await this.waterLog.goalMl().catch(() => null);
    if (goal !== null) {
      this.waterMl.set(goal);
    }
  }
}
