import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

export type NoticeTone = 'info' | 'warning' | 'danger';

const ICONS: Record<NoticeTone, string> = {
  info: 'information-circle-outline',
  warning: 'warning-outline',
  danger: 'alert-circle-outline',
};

/**
 * Inline message with a heading. Tone is conveyed by icon and title text as
 * well as color. The heading level is configurable to fit the page outline.
 */
@Component({
  selector: 'fit-notice',
  template: `
    <ion-icon class="icon" [name]="icon()" aria-hidden="true" />
    <div class="text">
      @if (headingLevel() === 2) {
        <h2 class="title">{{ title() }}</h2>
      } @else {
        <h3 class="title">{{ title() }}</h3>
      }
      <div class="message"><ng-content /></div>
    </div>
  `,
  styleUrl: './notice.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-tone]': 'tone()' },
})
export class NoticeComponent {
  readonly title = input.required<string>();
  readonly tone = input<NoticeTone>('info');
  readonly headingLevel = input<2 | 3>(3);

  protected readonly icon = computed(() => ICONS[this.tone()]);
}
