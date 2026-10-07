import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EmptyStateComponent, FitnessCardComponent, PageLayoutComponent } from '../../shared/ui';

/** Nutrition section shell. Food, calorie and macro tracking arrive in a later phase. */
@Component({
  selector: 'app-nutrition',
  template: `
    <fit-page title="Nutrition">
      <fit-card>
        <fit-empty-state
          icon="restaurant-outline"
          title="Nothing logged yet"
          description="Meals, calories and macros you log will appear here, along with your daily targets."
        />
      </fit-card>
    </fit-page>
  `,
  imports: [EmptyStateComponent, FitnessCardComponent, PageLayoutComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NutritionPage {}
