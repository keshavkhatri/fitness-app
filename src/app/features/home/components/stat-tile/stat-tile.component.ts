import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

export type StatTileTone = 'body' | 'goal' | 'neutral';

/**
 * A compact bento tile on a native <button>: an icon chip and label, then
 * projected content (phrasing only: <span>s and inline SVG). Pass `label`
 * as the button's full accessible name; the visible parts are decorative.
 *
 * <button app-stat-tile type="button" icon="scale-outline" heading="Weight" tone="body" label="…">…</button>
 */
@Component({
  selector: 'button[app-stat-tile]',
  template: `
    <span class="head" aria-hidden="true">
      <span class="icon" [attr.data-tone]="tone()"><ion-icon [name]="icon()" /></span>
      {{ heading() }}
    </span>
    <span class="body" aria-hidden="true"><ng-content /></span>
  `,
  styleUrl: './stat-tile.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.aria-label]': 'label()' },
})
export class StatTileComponent {
  readonly icon = input.required<string>();
  /** Visible tile title, e.g. "Weight". */
  readonly heading = input.required<string>();
  /** The whole tile as one sentence for assistive tech. */
  readonly label = input.required<string>();
  readonly tone = input<StatTileTone>('neutral');
}
