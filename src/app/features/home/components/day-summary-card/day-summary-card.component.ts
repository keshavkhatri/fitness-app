import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent, FitnessProgressComponent, LoadingSkeletonComponent } from '../../../../shared/ui';
import { HomeTileAction, HomeTileView, HomeTodayView } from '../../home-today';

/**
 * "Your day": today's training as the ring, plus Train, Fuel and Body tiles.
 * Each part may still be loading (null), independently. Presentational only:
 * a tile tap emits its action and the page navigates.
 */
@Component({
  selector: 'app-day-summary-card',
  template: `
    @let t = today();
    <fit-card padding="none">
      <div class="head">
        <div class="intro">
          <h2 class="title" [id]="headingId()">Your day</h2>
          @if (t) {
            <p class="status" data-testid="home-day-status">{{ t.status }}</p>
          } @else {
            <fit-skeleton width="80%" height="18px" />
          }
        </div>

        @if (t?.ring; as ring) {
          @if (ring.kind === 'progress') {
            <fit-progress
              variant="ring"
              label="Today’s workout"
              data-testid="home-day-ring"
              [ringSize]="96"
              [value]="ring.value"
              [max]="ring.max"
              [valueText]="ring.valueText"
            >
              <span class="ring-value">{{ ring.label }}</span>
              <span class="ring-caption">{{ ring.caption }}</span>
            </fit-progress>
          } @else {
            <div class="ring-state" data-testid="home-day-state">
              <ion-icon [name]="ring.icon" aria-hidden="true" />
              <span class="ring-caption">{{ ring.label }}</span>
            </div>
          }
        } @else {
          <fit-skeleton class="ring-skeleton" width="96px" height="96px" radius="pill" />
        }
      </div>

      <ul class="tiles" [attr.aria-labelledby]="headingId()">
        @for (tile of tiles(); track $index) {
          <li>
            @if (tile) {
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
                <span class="tile-value">
                  <span class="value">{{ tile.value }}</span>
                  @if (tile.unit; as unit) {
                    <span class="unit">{{ unit }}</span>
                  }
                </span>
                @if (tile.progress; as p) {
                  <!-- Decorative: the button's label carries the value. -->
                  <span class="bar" [attr.data-tone]="p.tone">
                    <span class="bar-fill" [style.width.%]="fill(p.value, p.max)"></span>
                  </span>
                }
                @if (tile.note; as note) {
                  <span class="tile-note">{{ note }}</span>
                }
              </button>
            } @else {
              <div class="tile" aria-hidden="true">
                <fit-skeleton width="32px" height="32px" radius="pill" />
                <fit-skeleton width="70%" height="14px" />
                <fit-skeleton width="90%" height="20px" />
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
  host: {
    '[attr.aria-busy]': 'loading() ? "true" : null',
  },
})
export class DaySummaryCardComponent {
  /** Ring, status and Train tile; null while the plan loads. */
  readonly today = input.required<HomeTodayView | null>();
  /** null while nutrition loads. */
  readonly fuel = input.required<HomeTileView | null>();
  /** null while weigh-ins load. */
  readonly body = input.required<HomeTileView | null>();
  readonly headingId = input('home-day');

  readonly tileSelected = output<HomeTileAction>();

  protected readonly tiles = computed(() => [this.today()?.train ?? null, this.fuel(), this.body()]);
  protected readonly loading = computed(() => this.tiles().some((t) => t === null));

  protected fill(value: number, max: number): number {
    return max > 0 ? Math.min(Math.max(value / max, 0), 1) * 100 : 0;
  }
}
