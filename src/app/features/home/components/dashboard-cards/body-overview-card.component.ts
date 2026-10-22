import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FitnessCardComponent } from '../../../../shared/ui';
import { BodyOverviewView } from '../../home-dashboard';

/** The latest weigh-in with this month's line and change. Opens weight history; without weigh-ins, logs one. */
@Component({
  selector: 'app-body-overview-card',
  template: `
    @let b = body();
    <fit-card>
      <div class="head">
        <h2 class="title">
          <button
            type="button"
            class="title-link"
            data-testid="home-body-open"
            [attr.aria-label]="b.kind === 'ready' ? 'Body overview. ' + b.accessibleLabel : 'Body overview. No weigh-ins yet. Log weight'"
            (click)="b.kind === 'ready' ? open.emit() : logWeight.emit()"
          >
            <ion-icon name="person-outline" aria-hidden="true" />Body overview
          </button>
        </h2>
        <span class="chevron" aria-hidden="true"><ion-icon name="chevron-forward" /></span>
      </div>
      @if (b.kind === 'ready') {
        <div aria-hidden="true">
          <p class="weight" data-testid="home-body-weight">{{ b.latest }}</p>
          <p class="caption">Current weight</p>
        </div>
        <div class="foot" aria-hidden="true">
          @if (line(); as l) {
            <span class="spark-box" [class.beside]="!!b.change">
              <svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none">
                <path class="area" [attr.d]="l.area" />
                <polyline class="line" [attr.points]="l.points" />
              </svg>
              <span class="last" [style.left.%]="l.lastX" [style.top.%]="l.lastY"></span>
            </span>
          }
          @if (b.change) {
            <span class="change-wrap">
              <span class="change" [attr.data-direction]="b.direction" data-testid="home-body-change">
                @if (b.direction === 'down') {
                  <ion-icon name="arrow-down" />
                } @else if (b.direction === 'up') {
                  <ion-icon name="arrow-up" />
                }
                {{ b.change }}
              </span>
              <span class="period">This month</span>
            </span>
          }
        </div>
      } @else {
        <p class="caption empty">No weigh-ins yet</p>
        <span class="log" aria-hidden="true">Log weight<ion-icon name="add" /></span>
      }
    </fit-card>
  `,
  styleUrl: './body-overview-card.component.scss',
  imports: [IonIcon, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BodyOverviewCardComponent {
  readonly body = input.required<BodyOverviewView>();
  readonly open = output<void>();
  readonly logWeight = output<void>();

  /** The sparkline in a 100 × 40 box (4 units of room top and bottom). */
  protected readonly line = computed(() => {
    const b = this.body();
    if (b.kind !== 'ready' || b.points.length < 2) {
      return null;
    }
    const n = b.points.length;
    const xy = b.points.map((p, i) => [(i / (n - 1)) * 96 + 2, 36 - p * 32] as const);
    const points = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const [lx, ly] = xy[n - 1];
    return { points, area: `M2,40 L${points.replace(/ /g, ' L')} L${lx.toFixed(1)},40 Z`, lastX: lx, lastY: (ly / 40) * 100 };
  });
}
