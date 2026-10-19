import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { FREE_FEATURES, PRO_FEATURES } from '../../../core/entitlements/access-policy';

/** Free features shown before "Show all": enough to give the picture without a long list at 320 px. */
const VISIBLE_FREE = 4;

/**
 * Free and Pro side by side, straight from the feature matrix (the single source of truth): what only Pro
 * adds first, then what both include. Every mark has words for screen readers; nothing relies on colour.
 */
@Component({
  selector: 'app-plan-comparison',
  template: `
    <section class="compare" aria-labelledby="compare-title" data-testid="offer-compare">
      <div class="head">
        <h2 class="title" id="compare-title">What you get</h2>
        <span class="col" aria-hidden="true">Free</span>
        <span class="col pro" aria-hidden="true">Pro</span>
      </div>
      <ul class="rows" data-testid="offer-pro-features">
        @for (feature of proOnly; track feature.id) {
          <li class="row highlight">
            <span class="feature">{{ feature.label }}</span>
            <span class="mark no"><ion-icon name="remove-outline" aria-hidden="true" /><span class="visually-hidden">Not in Free</span></span>
            <span class="mark yes pro"><ion-icon name="checkmark" aria-hidden="true" /><span class="visually-hidden">Included in Pro</span></span>
          </li>
        }
      </ul>
      <ul class="rows" data-testid="offer-free">
        @for (feature of visibleFree; track feature.id) {
          <ng-container *ngTemplateOutlet="row; context: { $implicit: feature.label }" />
        }
      </ul>
      @if (moreFree.length) {
        <details class="more">
          <summary data-testid="offer-free-more">All {{ freeCount }} free features</summary>
          <ul class="rows">
            @for (feature of moreFree; track feature.id) {
              <ng-container *ngTemplateOutlet="row; context: { $implicit: feature.label }" />
            }
          </ul>
        </details>
      }
    </section>

    <ng-template #row let-label>
      <li class="row">
        <span class="feature">{{ label }}</span>
        <span class="mark yes"><ion-icon name="checkmark" aria-hidden="true" /><span class="visually-hidden">Included in Free</span></span>
        <span class="mark yes pro"><ion-icon name="checkmark" aria-hidden="true" /><span class="visually-hidden">Included in Pro</span></span>
      </li>
    </ng-template>
  `,
  styleUrl: './plan-comparison.component.scss',
  imports: [IonIcon, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanComparisonComponent {
  protected readonly proOnly = PRO_FEATURES;
  protected readonly visibleFree = FREE_FEATURES.slice(0, VISIBLE_FREE);
  protected readonly moreFree = FREE_FEATURES.slice(VISIBLE_FREE);
  protected readonly freeCount = FREE_FEATURES.length;
}
