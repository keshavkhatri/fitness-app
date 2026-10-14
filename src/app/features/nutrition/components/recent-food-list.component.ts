import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { RecentFoodRowView } from '../add-food-view-model';
import { FoodThumbComponent } from './food-thumb.component';

/**
 * Recent foods as rows: tap the food to change it before adding, or the lime
 * + to add it as it was. A row's + is disabled while it saves and shows a
 * check once added.
 */
@Component({
  selector: 'app-recent-food-list',
  template: `
    <ul class="foods">
      @for (row of rows(); track row.id) {
        <li class="food">
          <button type="button" class="food-main" [attr.aria-label]="row.reviewLabel" data-testid="recent-food" (click)="review.emit(row)">
            <app-food-thumb />
            <span class="food-text">
              <span class="food-name">{{ row.name }}</span>&ngsp;
              <span class="food-detail">{{ row.detail }}</span>
            </span>
          </button>
          <button
            type="button"
            class="food-add"
            [class.done]="added().has(row.id)"
            [attr.aria-label]="row.addLabel"
            [attr.aria-busy]="pending().has(row.id) || null"
            [disabled]="pending().has(row.id) || added().has(row.id)"
            data-testid="quick-add"
            (click)="add.emit(row)"
          >
            <ion-icon [name]="added().has(row.id) ? 'checkmark' : 'add'" aria-hidden="true" />
          </button>
        </li>
      }
    </ul>
  `,
  styleUrl: './recent-food-list.component.scss',
  imports: [IonIcon, FoodThumbComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecentFoodListComponent {
  readonly rows = input.required<readonly RecentFoodRowView[]>();
  /** Rows being saved. */
  readonly pending = input<ReadonlySet<string>>(new Set());
  /** Rows just added (shown with a check, not tappable for a moment). */
  readonly added = input<ReadonlySet<string>>(new Set());

  readonly add = output<RecentFoodRowView>();
  readonly review = output<RecentFoodRowView>();
}
