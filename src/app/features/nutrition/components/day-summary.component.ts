import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { FitnessButtonComponent, FitnessProgressComponent } from '../../../shared/ui';
import { NUTRITION_COPY } from '../nutrition-content';
import { CalorieSummaryView, MacroRowView } from '../nutrition-view-model';

/**
 * The day at a glance: calories eaten in a ring (filled against the target
 * when there is one; a plain ring with intake only when there isn't), the
 * three macros with bars against their targets, and Log Food.
 */
@Component({
  selector: 'app-day-summary',
  template: `
    <section class="today" aria-labelledby="nutrition-calories" data-testid="calorie-summary">
      <h2 class="visually-hidden" id="nutrition-calories">{{ copy.calories.title }}</h2>
      @let c = calories();
      @if (c.progress; as p) {
        <fit-progress class="ring" variant="ring" gradient [ringSize]="176" [thickness]="3" [value]="p.value" [max]="p.max" [label]="copy.calories.progressLabel" [valueText]="p.valueText">
          <ng-container *ngTemplateOutlet="kcal" />
        </fit-progress>
      } @else {
        <!-- No target: what was eaten, inside a plain ring (no progress is implied). -->
        <div class="ring plain"><ng-container *ngTemplateOutlet="kcal" /></div>
      }
      <ng-template #kcal>
        <p class="kcal" data-testid="calorie-headline">
          <span class="kcal-eaten">{{ c.eaten }}</span>&ngsp;<span class="kcal-target">{{ c.target ? copy.calories.of(c.target) : copy.calories.eaten }}</span>
        </p>
      </ng-template>
      @if (c.status; as status) {
        <p class="kcal-status" [class.over]="c.over" data-testid="calorie-status">{{ status }}</p>
      } @else {
        <p class="kcal-status" data-testid="calorie-status">{{ copy.calories.noTarget }}</p>
      }

      <ul class="macros" data-testid="macro-summary" [attr.aria-label]="copy.macros.title">
        @for (m of macros(); track m.key) {
          <li class="macro" [attr.data-testid]="'macro-' + m.key">
            <span class="macro-label">{{ m.label }}</span>&ngsp;
            <span class="macro-eaten">{{ m.eaten }}</span>
            @if (m.target) {
              &ngsp;<span class="macro-target">/ {{ m.target }}</span>
            }
            @if (m.progress; as p) {
              <fit-progress class="macro-bar" [value]="p.value" [max]="p.max" [label]="m.label" [valueText]="p.valueText" />
            }
          </li>
        }
      </ul>

      <button fit-button type="button" size="lg" block icon="add" data-testid="log-food" (click)="logFood.emit()">{{ copy.logFood }}</button>
    </section>
  `,
  styleUrl: './day-summary.component.scss',
  imports: [NgTemplateOutlet, FitnessButtonComponent, FitnessProgressComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DaySummaryComponent {
  readonly calories = input.required<CalorieSummaryView>();
  readonly macros = input.required<readonly MacroRowView[]>();
  readonly logFood = output<void>();

  protected readonly copy = NUTRITION_COPY;
}
