import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

/**
 * Direction is what the number did; sentiment is whether that is good for the
 * user (weight going down can be positive). Kept separate on purpose.
 */
export interface MetricTrend {
  direction: 'up' | 'down' | 'flat';
  sentiment: 'positive' | 'negative' | 'neutral';
  /** Human-readable change, e.g. "−0.6 kg this week". Always shown as text. */
  label: string;
}

export type FitnessMetricSize = 'md' | 'lg';

const TREND_PRESENTATION: Record<MetricTrend['direction'], { icon: string | null; srText: string }> = {
  up: { icon: 'trending-up', srText: 'Up' },
  down: { icon: 'trending-down', srText: 'Down' },
  flat: { icon: null, srText: 'No change' },
};

/** A labelled value with optional unit and trend. */
@Component({
  selector: 'fit-metric',
  template: `
    <span class="label">{{ label() }}</span>
    <span class="value">
      <span class="number">{{ value() }}</span>
      @if (unit(); as unitText) {
        <span class="unit">{{ unitText }}</span>
      }
    </span>
    @if (trend(); as t) {
      <span class="trend" [attr.data-sentiment]="t.sentiment">
        @let presentation = trendPresentation[t.direction];
        @if (presentation.icon; as iconName) {
          <ion-icon [name]="iconName" aria-hidden="true" />
        }
        <!-- The icon is decorative; direction must still reach screen readers. -->
        <span class="visually-hidden">{{ presentation.srText }}</span>
        {{ t.label }}
      </span>
    }
  `,
  styleUrl: './fitness-metric.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-size]': 'size()' },
})
export class FitnessMetricComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly unit = input<string>();
  readonly trend = input<MetricTrend>();
  readonly size = input<FitnessMetricSize>('md');

  protected readonly trendPresentation = TREND_PRESENTATION;
}
