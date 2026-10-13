import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent, FitnessProgressComponent, LoadingSkeletonComponent } from '../../../../shared/ui';
import { HomeDayView, HomeTileAction } from '../../home-today';

/**
 * "Your day, in motion": today's goals as one ring and three tiles (Move,
 * Train, Recover). Presentational only: a tile tap emits its action.
 */
@Component({
  selector: 'app-day-summary-card',
  template: `
    @let d = day();
    <fit-card [attr.aria-busy]="d ? null : 'true'">
        <div class="intro">
          <h2 class="title" [id]="headingId()">Your day, in motion</h2>
          @if (d) {
            <p class="status" data-testid="home-day-status">{{ d.status }}</p>
          } @else {
            <fit-skeleton width="80%" height="16px" />
          }
        </div>
        @if (d) {
          <fit-progress
            variant="ring"
            gradient
            label="Today’s goals"
            class="ring"
            data-testid="home-day-ring"
            [ringSize]="92"
            [thickness]="4.4"
            [value]="d.percent"
            [max]="100"
            [valueText]="d.valueText"
          >
            <span class="ring-value">{{ d.percent }}%</span>
            <span class="ring-caption">Today</span>
          </fit-progress>
        } @else {
          <fit-skeleton class="ring-skeleton" width="92px" height="92px" radius="pill" />
        }

      <ul class="tiles" [attr.aria-labelledby]="headingId()">
        @for (i of slots; track i) {
          <li>
            @if (d?.tiles?.[i]; as tile) {
              <button
                type="button"
                class="tile"
                [attr.data-key]="tile.key"
                [attr.data-testid]="'home-tile-' + tile.key"
                [attr.aria-label]="tile.accessibleLabel"
                (click)="tileSelected.emit(tile.action)"
              >
                <span class="tile-icon" aria-hidden="true"><ion-icon [name]="tile.icon" /></span>
                <span class="tile-label">{{ tile.label }}</span>
                <span class="tile-value" [attr.data-emphasis]="tile.emphasis">
                  <span class="value">{{ tile.value }}</span>
                  @if (tile.unit; as unit) {
                    <span class="unit">{{ unit }}</span>
                  }
                </span>
                <!-- Decorative: the button's label carries the value. -->
                <span class="bar" [class.inactive]="tile.fraction === null">
                  <span class="bar-fill" [style.width.%]="(tile.fraction ?? 0) * 100"></span>
                </span>
              </button>
            } @else {
              <div class="tile" aria-hidden="true">
                <fit-skeleton width="44px" height="44px" radius="md" />
                <fit-skeleton width="70%" height="14px" />
                <fit-skeleton width="90%" height="14px" />
              </div>
            }
          </li>
        }
      </ul>
    </fit-card>
  `,
  styleUrl: './day-summary-card.component.scss',
  imports: [IonIcon, FitnessCardComponent, FitnessProgressComponent, LoadingSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DaySummaryCardComponent {
  /** null while today's data loads. */
  readonly day = input.required<HomeDayView | null>();
  readonly headingId = input('home-day');

  readonly tileSelected = output<HomeTileAction>();

  protected readonly slots = [0, 1, 2] as const;
}
