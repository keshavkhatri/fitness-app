import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';

import {
  EmptyStateComponent,
  FitnessButtonComponent,
  FitnessCardComponent,
  FitnessChipComponent,
  LoadingSkeletonComponent,
  PageLayoutComponent,
  SectionHeaderComponent,
} from '../../shared/ui';
import { GoalSummaryCardComponent } from './components/goal-summary-card/goal-summary-card.component';
import { NutritionSummaryCardComponent } from './components/nutrition-summary-card/nutrition-summary-card.component';
import { ProgressSummaryCardComponent } from './components/progress-summary-card/progress-summary-card.component';
import { TodayWorkoutCardComponent } from './components/today-workout-card/today-workout-card.component';
import { HomeSummarySource } from './data/home-summary.source';
import { greetingFor } from './greeting';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  imports: [
    DatePipe,
    EmptyStateComponent,
    FitnessButtonComponent,
    FitnessCardComponent,
    FitnessChipComponent,
    LoadingSkeletonComponent,
    PageLayoutComponent,
    SectionHeaderComponent,
    GoalSummaryCardComponent,
    NutritionSummaryCardComponent,
    ProgressSummaryCardComponent,
    TodayWorkoutCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly summarySource = inject(HomeSummarySource);

  protected readonly today = new Date();
  protected readonly greeting = greetingFor(this.today);
  protected readonly isDemo = this.summarySource.isDemo;
  protected readonly summary = resource({ loader: () => this.summarySource.load() });
}
