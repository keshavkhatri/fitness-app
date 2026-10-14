import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { NutrientView } from '../edit-food-view-model';

/** Calories, protein, carbs and fat side by side ("165 kcal · 31 g Protein · …"). */
@Component({
  selector: 'app-nutrient-row',
  template: `
    <dl class="nutrients">
      @for (n of nutrients(); track n.key) {
        <div class="nutrient"><dt>{{ n.label }}</dt>&ngsp;<dd>{{ n.value }}</dd></div>
      }
    </dl>
  `,
  styleUrl: './nutrient-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NutrientRowComponent {
  readonly nutrients = input.required<readonly NutrientView[]>();
}
