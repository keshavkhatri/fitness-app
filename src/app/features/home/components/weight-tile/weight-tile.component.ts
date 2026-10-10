import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { HomeWeightView } from '../../home-weight';
import { StatTileComponent } from '../stat-tile/stat-tile.component';

/**
 * The latest recorded weight and a sparkline of the last 30 days (recorded
 * points only). The change is a neutral difference, never framed as progress.
 */
@Component({
  selector: 'app-weight-tile',
  template: `
    @let w = weight();
    @switch (w.kind) {
      @case ('ready') {
        <button app-stat-tile type="button" icon="scale-outline" heading="Weight" tone="body" [label]="w.accessibleLabel" (click)="openHistory.emit()">
          <span class="value" data-testid="home-weight-value">{{ w.value }}<small>{{ w.unit }}</small></span>
          <span class="sub">{{ w.dateLabel }}</span>
          @if (w.points.length > 1) {
            <svg class="spark" viewBox="-4 -4 108 108" preserveAspectRatio="none">
              <polyline [attr.points]="polyline()" vector-effect="non-scaling-stroke" />
            </svg>
          }
          @if (w.change; as change) {
            <span class="foot" data-testid="home-weight-change">{{ change }}</span>
          }
        </button>
      }
      @case ('empty') {
        <button app-stat-tile type="button" icon="scale-outline" heading="Weight" tone="body" label="Body weight: no weigh-ins yet. Log weight." (click)="logWeight.emit()">
          <span class="title">No weigh-ins yet</span>
          <span class="sub">Your trend starts with one entry.</span>
          <span class="foot action">Log weight</span>
        </button>
      }
      @default {
        <button app-stat-tile type="button" icon="scale-outline" heading="Weight" label="Body weight couldn't be loaded. Try again." (click)="retry.emit()">
          <span class="title">Couldn’t load</span>
          <span class="foot action">Try again</span>
        </button>
      }
    }
  `,
  styleUrl: './weight-tile.component.scss',
  imports: [StatTileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeightTileComponent {
  readonly weight = input.required<HomeWeightView>();
  readonly openHistory = output<void>();
  readonly logWeight = output<void>();
  readonly retry = output<void>();

  protected readonly polyline = computed(() => {
    const w = this.weight();
    return w.kind === 'ready' ? w.points.map((p) => `${p.x},${p.y}`).join(' ') : '';
  });
}
