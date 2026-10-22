import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { BottomSheetComponent } from '../../../../shared/ui';
import { DailyTip } from '../../home-dashboard-content';
import { MINDSET_PHOTO } from '../../home-media';

/** Today's quote over a photo, and the tip of the day in a sheet. */
@Component({
  selector: 'app-mindset-card',
  template: `
    <section class="photo" aria-labelledby="home-mindset-title" [style.--photo]="'url(' + photo + ')'">
      <h2 id="home-mindset-title" class="eyebrow">Mindset for today</h2>
      <p class="quote" data-testid="home-mindset-quote">“{{ quote() }}”</p>
      <button type="button" class="pill" data-testid="home-tip-open" (click)="tipOpen.set(true)">
        <ion-icon name="star" aria-hidden="true" />See tip of the day<ion-icon name="chevron-forward" aria-hidden="true" />
      </button>
    </section>

    <fit-bottom-sheet title="Tip of the day" [description]="tip().topic" screenTheme="dashboard" [(open)]="tipOpen">
      <div class="tip" data-testid="home-tip">
        <h3>{{ tip().title }}</h3>
        <p>{{ tip().body }}</p>
      </div>
    </fit-bottom-sheet>
  `,
  styleUrl: './mindset-card.component.scss',
  imports: [IonIcon, BottomSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MindsetCardComponent {
  readonly quote = input.required<string>();
  readonly tip = input.required<DailyTip>();

  protected readonly photo = MINDSET_PHOTO;
  protected readonly tipOpen = signal(false);
}
