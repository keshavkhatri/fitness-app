import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { WorkoutOverviewView } from '../workout-summary-view-model';

/** Decorative confetti: [left %, top px, rotation deg, tone]. */
const CONFETTI: readonly (readonly [number, number, number, 0 | 1 | 2])[] = [
  [10, 18, 30, 0], [22, 52, -20, 1], [78, 14, 50, 2], [88, 48, -35, 0], [6, 78, 70, 2], [93, 86, 15, 1],
];

/** Completion overview (dark): the result, the key numbers and what the log shows. */
@Component({
  selector: 'app-summary-overview',
  template: `
    @let v = overview();
    <header class="hero">
      @if (v.fullyCompleted) {
        <div class="confetti" aria-hidden="true">
          @for (piece of confetti; track $index) {
            <span [class]="'piece tone-' + piece[3]" [style.left.%]="piece[0]" [style.top.px]="piece[1]" [style.rotate.deg]="piece[2]"></span>
          }
        </div>
      }
      <span class="mark" [class.partial]="!v.fullyCompleted" aria-hidden="true">
        <ion-icon [name]="v.fullyCompleted ? 'checkmark' : 'flag-outline'" />
      </span>
      <h1 class="title" tabindex="-1" data-view-heading data-testid="summary-heading">{{ v.heading }}</h1>
      <p class="message" data-testid="summary-message">{{ v.message }}</p>
    </header>

    <section class="workout" aria-labelledby="summary-workout-name">
      <h2 class="workout-name" id="summary-workout-name" data-testid="summary-name">{{ v.workoutName }}</h2>
      <p class="workout-when">
        <ion-icon name="calendar-outline" aria-hidden="true" />
        <span><span class="visually-hidden">Finished </span>{{ v.finishedAt }}</span>
      </p>
    </section>

    <dl class="stats" data-testid="summary-stats">
      @for (stat of v.stats; track stat.key) {
        <div class="stat" [attr.data-key]="stat.key">
          <ion-icon [name]="stat.icon" aria-hidden="true" />
          <dt class="label">{{ stat.label }}</dt>&ngsp;
          <dd class="value">
            {{ stat.value }}
            @if (stat.unit) {
              <span class="unit">{{ stat.unit }}</span>
            }
          </dd>
        </div>&ngsp;
      }
    </dl>

    <aside class="highlight" [attr.data-tone]="v.highlight.tone" data-testid="summary-highlight">
      <span class="highlight-icon" aria-hidden="true"><ion-icon [name]="v.highlight.tone === 'success' ? 'star' : 'information-circle-outline'" /></span>
      <p><strong>{{ v.highlight.title }}</strong> {{ v.highlight.text }}</p>
    </aside>
  `,
  styleUrl: './overview-view.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SummaryOverviewComponent {
  readonly overview = input.required<WorkoutOverviewView>();
  protected readonly confetti = CONFETTI;
}
