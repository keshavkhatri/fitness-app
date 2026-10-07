import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type SkeletonRadius = 'sm' | 'md' | 'card' | 'pill';

/**
 * Placeholder block shown while content loads. Decorative: the loading
 * container should set `aria-busy="true"` and provide a text alternative.
 */
@Component({
  selector: 'fit-skeleton',
  template: '',
  styleUrl: './loading-skeleton.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
    '[style.border-radius]': '"var(--radius-" + radius() + ")"',
  },
})
export class LoadingSkeletonComponent {
  readonly width = input('100%');
  readonly height = input('16px');
  readonly radius = input<SkeletonRadius>('sm');
}
