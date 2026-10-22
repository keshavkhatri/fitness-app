import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { TRACK_PROGRESS_PHOTO } from '../../home-media';

/** A photo card that opens the Progress tab. */
@Component({
  selector: 'app-track-progress-card',
  template: `
    <section class="photo" aria-labelledby="home-track-title" [style.background-image]="'url(' + photo + ')'">
      <h2 id="home-track-title" class="title"><ion-icon name="trending-up" aria-hidden="true" />Track your progress</h2>
      <p class="text">Log your weight, measurements and see your transformation.</p>
      <button type="button" class="pill" data-testid="home-track-open" (click)="open.emit()">
        View progress<ion-icon name="chevron-forward" aria-hidden="true" />
      </button>
    </section>
  `,
  styleUrl: './track-progress-card.component.scss',
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrackProgressCardComponent {
  readonly open = output<void>();
  protected readonly photo = TRACK_PROGRESS_PHOTO;
}
