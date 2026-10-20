import { ChangeDetectionStrategy, Component, booleanAttribute, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { CUSTOM_PLAN_COPY } from './custom-plan-content';

export type CustomPlanStep = 'basics' | 'workout' | 'review';

const STEPS: readonly CustomPlanStep[] = ['basics', 'workout', 'review'];

/**
 * The custom plan flow's dark header: back, the title, Save, and the three steps (Basics → Workout →
 * Review) with the current one marked (by number, ring and `aria-current`, not colour alone).
 */
@Component({
  selector: 'app-custom-plan-header',
  template: `
    <header class="header">
      <div class="bar">
        <button type="button" class="icon" [attr.aria-label]="backLabel()" data-testid="plan-header-back" (click)="back.emit()">
          <ion-icon name="chevron-back" aria-hidden="true" />
        </button>
        <h1 class="title" data-testid="plan-header-title">{{ copy.title }}</h1>
        <button type="button" class="save" [disabled]="saveDisabled()" data-testid="plan-header-save" (click)="save.emit()">{{ copy.save }}</button>
      </div>
      <ol class="steps" [attr.aria-label]="copy.stepsLabel">
        @for (s of steps; track s; let i = $index) {
          <li class="step" [class.current]="s === step()" [class.done]="i < indexOf(step())" [attr.aria-current]="s === step() ? 'step' : null">
            <span class="dot" aria-hidden="true">{{ i + 1 }}</span>
            <span class="label">{{ copy.steps[s] }}</span>
          </li>
        }
      </ol>
    </header>
  `,
  styles: `
    @use 'mixins' as fx;

    .header {
      padding: calc(var(--ion-safe-area-top, 0px) + var(--space-2)) var(--space-4) var(--space-5);
      background: var(--color-ink);
      color: var(--color-on-ink);
    }

    .bar {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .icon,
    .save {
      @include fx.button-reset;
      @include fx.focus-ring;

      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: var(--tap-target-min);
      min-height: var(--tap-target-min);
      color: inherit;
    }

    .icon ion-icon {
      font-size: 22px;
    }

    .save {
      @include fx.text(body-sm, semibold);

      &:disabled {
        opacity: 0.45;
      }
    }

    .title {
      @include fx.text(body, semibold);
      flex: 1;
      margin: 0;
      text-align: center;
    }

    .steps {
      position: relative;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      margin: var(--space-3) 0 0;
      padding: 0;
      list-style: none;

      // The connecting line, behind the dots.
      &::before {
        content: '';
        position: absolute;
        top: 13px;
        right: 16.66%;
        left: 16.66%;
        height: 2px;
        background: rgba(255, 255, 255, 0.18);
      }
    }

    .step {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .dot {
      @include fx.text(caption, semibold);
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: var(--radius-pill);
      background: var(--color-ink);
      box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.28);
      color: var(--color-on-ink);
    }

    .label {
      @include fx.text(caption);
      color: rgba(255, 255, 255, 0.72);
    }

    .done .dot {
      background: var(--color-ink-accent);
      box-shadow: none;
      color: var(--color-ink);
    }

    .current .dot {
      background: var(--color-ink);
      box-shadow:
        inset 0 0 0 2px var(--color-ink-accent),
        0 0 0 4px rgba(var(--color-ink-accent-rgb), 0.22);
      color: var(--color-ink-accent);
    }

    .current .label {
      color: var(--color-on-ink);
      font-weight: 600;
    }
  `,
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomPlanHeaderComponent {
  readonly step = input.required<CustomPlanStep>();
  readonly backLabel = input<string>(CUSTOM_PLAN_COPY.header.back);
  readonly saveDisabled = input(false, { transform: booleanAttribute });
  readonly back = output<void>();
  readonly save = output<void>();

  protected readonly copy = CUSTOM_PLAN_COPY.header;
  protected readonly steps = STEPS;
  protected indexOf(step: CustomPlanStep): number {
    return STEPS.indexOf(step);
  }
}
