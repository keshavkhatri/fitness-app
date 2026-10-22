import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent } from '../../../../shared/ui';
import { WeeklyProgressView } from '../../home-dashboard';

/** The week so far: workouts, average steps and average calories, each with a bar to its goal. Opens Progress. */
@Component({
  selector: 'app-weekly-progress-card',
  template: `
    @let w = progress();
    <fit-card>
      <div class="head">
        <h2 class="title">
          <button type="button" class="title-link" data-testid="home-weekly-open" [attr.aria-label]="'Weekly progress. ' + w.accessibleLabel" (click)="open.emit()">
            <ion-icon name="trending-up" aria-hidden="true" />Weekly progress
          </button>
        </h2>
        <span class="chevron" aria-hidden="true"><ion-icon name="chevron-forward" /></span>
      </div>
      <ul class="stats" aria-hidden="true">
        @for (stat of w.stats; track stat.label) {
          <li>
            <span class="label">{{ stat.label }}</span>
            <span class="value" [attr.data-testid]="'home-weekly-' + $index">{{ stat.value }}</span>
            <span class="track"><span class="fill" [style.width.%]="(stat.progress ?? 0) * 100"></span></span>
          </li>
        }
      </ul>
    </fit-card>
  `,
  styleUrl: './weekly-progress-card.component.scss',
  imports: [IonIcon, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeeklyProgressCardComponent {
  readonly progress = input.required<WeeklyProgressView>();
  readonly open = output<void>();
}
