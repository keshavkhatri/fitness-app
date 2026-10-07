import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EmptyStateComponent, FitnessCardComponent, PageLayoutComponent } from '../../shared/ui';

/** Workout section shell. Planning and logging arrive in a later phase. */
@Component({
  selector: 'app-workout',
  template: `
    <fit-page title="Workout">
      <fit-card>
        <fit-empty-state
          icon="barbell-outline"
          title="No workout plan yet"
          description="Your workouts will appear here once you create a plan or receive one from your coach."
        />
      </fit-card>
    </fit-page>
  `,
  imports: [EmptyStateComponent, FitnessCardComponent, PageLayoutComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkoutPage {}
