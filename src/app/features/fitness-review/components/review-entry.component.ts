import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FITNESS_REVIEW_COPY } from '../fitness-review-content';

/** Entry point to the Weekly Fitness Review (Home and Progress). */
@Component({
  selector: 'app-review-entry',
  template: `
    <button type="button" class="entry" data-testid="review-entry" (click)="open.emit()">
      <span class="icon" aria-hidden="true"><ion-icon name="calendar-outline" /></span>
      <span class="text">
        <span class="title">{{ copy.title }}</span>&ngsp;
        <span class="description">{{ copy.description }}</span>
      </span>
      <ion-icon class="chevron" name="chevron-forward" aria-hidden="true" />
    </button>
  `,
  styles: `
    @use 'mixins' as fx;

    :host {
      display: block;
    }

    .entry {
      @include fx.button-reset;
      @include fx.focus-ring;
      @include fx.pressable;

      display: flex;
      align-items: center;
      gap: var(--space-3);
      width: 100%;
      min-height: var(--tap-target-min);
      padding: var(--space-3) var(--space-4);
      border: var(--border-hairline) solid var(--color-border);
      border-radius: var(--radius-card);
      background: var(--color-surface);
      color: var(--color-text);
      text-align: start;
    }

    .icon {
      display: grid;
      flex: none;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: var(--radius-pill);
      background: var(--color-primary-soft);
      color: var(--color-primary-text);
      font-size: 20px;
    }

    .text {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
    }

    .title {
      @include fx.text(body, semibold);
    }

    .description {
      @include fx.text(body-sm);
      color: var(--color-text-secondary);
    }

    .chevron {
      flex: none;
      color: var(--color-text-tertiary);
      font-size: 18px;
    }
  `,
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewEntryComponent {
  readonly open = output<void>();
  protected readonly copy = FITNESS_REVIEW_COPY.entry;
}
