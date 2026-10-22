import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { MealCategory } from '../../../../domain/nutrition';
import { FitnessCardComponent } from '../../../../shared/ui';
import { MealTileView } from '../../home-dashboard';

const ICONS: Readonly<Record<MealCategory, string>> = {
  breakfast: 'sunny',
  lunch: 'partly-sunny',
  snacks: 'nutrition',
  dinner: 'moon',
};

/** Today's four meals, each with "+" to add food to it (and its calories once logged). The title opens Nutrition. */
@Component({
  selector: 'app-today-meals-card',
  template: `
    <fit-card>
      <div class="head">
        <h2 class="title">
          <button type="button" class="title-link" data-testid="home-meals-open" (click)="open.emit()">
            <ion-icon name="restaurant" aria-hidden="true" />Today's meals
          </button>
        </h2>
        <span class="chevron" aria-hidden="true"><ion-icon name="chevron-forward" /></span>
      </div>
      <ul class="meals">
        @for (tile of meals(); track tile.meal) {
          <li [attr.data-meal]="tile.meal" [style.--i]="$index">
            <ion-icon class="icon" [name]="icons[tile.meal]" aria-hidden="true" />
            <span class="name">{{ tile.label }}</span>
            @if (tile.calories) {
              <span class="kcal" [attr.data-testid]="'home-meal-kcal-' + tile.meal">{{ tile.calories }}</span>
            }
            <button type="button" class="add" [attr.data-testid]="'home-meal-add-' + tile.meal" [attr.aria-label]="tile.addLabel" (click)="add.emit(tile.meal)">
              <ion-icon name="add" aria-hidden="true" />
            </button>
          </li>
        }
      </ul>
    </fit-card>
  `,
  styleUrl: './today-meals-card.component.scss',
  imports: [IonIcon, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TodayMealsCardComponent {
  readonly meals = input.required<readonly MealTileView[]>();
  readonly open = output<void>();
  readonly add = output<MealCategory>();

  protected readonly icons = ICONS;
}
