import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { IsoCalendarDate } from '../../../domain/fitness-profile';
import { FitnessCardComponent } from '../../../shared/ui';
import { NUTRITION_COPY } from '../nutrition-content';
import { WeekDayRowView } from '../nutrition-week-view-model';

/** Monday–Sunday rows of the weekly summary; past days and today open in the food log. */
@Component({
  selector: 'app-week-day-list',
  templateUrl: './week-day-list.component.html',
  styleUrl: './week-day-list.component.scss',
  imports: [IonIcon, FitnessCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeekDayListComponent {
  readonly days = input.required<readonly WeekDayRowView[]>();
  readonly openDay = output<IsoCalendarDate>();

  protected readonly copy = NUTRITION_COPY.week;
}
