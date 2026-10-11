import { Injectable, inject } from '@angular/core';

import { activeDayStreak } from '../../domain/daily-check-in';
import { IsoCalendarDate } from '../../domain/fitness-profile';
import { completedWorkouts, isTrainingWorkout } from '../../domain/workout-session';
import { WeightHistoryService } from '../body-measurements/weight-history.service';
import { DailyCheckInService } from '../daily-check-in/daily-check-in.service';
import { NutritionRepository } from '../nutrition/nutrition.repository';
import { CLOCK, localIsoDate } from '../time/clock';
import { WorkoutHistoryService } from '../workout/workout-history.service';

/** How far back activity is read (a streak can't be longer than this). */
const LOOKBACK_DAYS = 400;

/**
 * The active-day streak shown on Home: consecutive local days on which the
 * user recorded anything (a finished training workout, food, a weigh-in,
 * steps or a recovery check-in). Days are counted, nothing is scored.
 * Sources that can't be read are skipped rather than failing the streak.
 */
@Injectable({ providedIn: 'root' })
export class ActivityStreakService {
  private readonly clock = inject(CLOCK);
  private readonly history = inject(WorkoutHistoryService);
  private readonly weights = inject(WeightHistoryService);
  private readonly food = inject(NutritionRepository);
  private readonly checkIns = inject(DailyCheckInService);

  async current(): Promise<number> {
    const now = this.clock();
    const today = localIsoDate(now);
    const from = localIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - LOOKBACK_DAYS));
    const days = new Set<IsoCalendarDate>();

    const [workouts, weights, food, checkIns] = await Promise.allSettled([
      this.history.list(),
      this.weights.load().then(() => this.weights.state()),
      this.food.loadRange(from, today),
      this.checkIns.load(),
    ]);
    if (workouts.status === 'fulfilled' && workouts.value.ok) {
      completedWorkouts(workouts.value.workouts)
        .filter(isTrainingWorkout)
        .forEach((log) => days.add(localIsoDate(new Date(log.completedAt as string))));
    }
    if (weights.status === 'fulfilled' && weights.value.status === 'ready') {
      weights.value.entries.forEach((e) => days.add(e.date));
    }
    if (food.status === 'fulfilled') {
      food.value.forEach((e) => days.add(e.date));
    }
    if (checkIns.status === 'fulfilled') {
      Object.entries(checkIns.value.steps).forEach(([date, steps]) => steps > 0 && days.add(date));
      Object.keys(checkIns.value.recovery).forEach((date) => days.add(date));
    }
    return activeDayStreak(days, today);
  }
}
