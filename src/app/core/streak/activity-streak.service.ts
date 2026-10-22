import { Injectable, inject } from '@angular/core';

import { ActivityDays, ActivityKind, activeDayStreak } from '../../domain/daily-check-in';
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
    return activeDayStreak(new Set((await this.activity()).keys()), this.today());
  }

  /** The user's local date now. */
  today(): IsoCalendarDate {
    return localIsoDate(this.clock());
  }

  /** Every active day (within the look-back) with what was recorded on it. */
  async activity(): Promise<ActivityDays> {
    const now = this.clock();
    const today = localIsoDate(now);
    const from = localIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - LOOKBACK_DAYS));
    const days = new Map<IsoCalendarDate, Set<ActivityKind>>();
    const mark = (date: IsoCalendarDate, kind: ActivityKind) => {
      if (date >= from && date <= today) {
        (days.get(date) ?? days.set(date, new Set()).get(date)!).add(kind);
      }
    };

    const [workouts, weights, food, checkIns] = await Promise.allSettled([
      this.history.list(),
      this.weights.load().then(() => this.weights.state()),
      this.food.loadRange(from, today),
      this.checkIns.load(),
    ]);
    if (workouts.status === 'fulfilled' && workouts.value.ok) {
      completedWorkouts(workouts.value.workouts)
        .filter(isTrainingWorkout)
        .forEach((log) => mark(localIsoDate(new Date(log.completedAt as string)), 'workout'));
    }
    if (weights.status === 'fulfilled' && weights.value.status === 'ready') {
      weights.value.entries.forEach((e) => mark(e.date, 'weight'));
    }
    if (food.status === 'fulfilled') {
      food.value.forEach((e) => mark(e.date, 'food'));
    }
    if (checkIns.status === 'fulfilled') {
      Object.entries(checkIns.value.steps).forEach(([date, steps]) => steps > 0 && mark(date, 'steps'));
      Object.keys(checkIns.value.recovery).forEach((date) => mark(date, 'recovery'));
      Object.keys(checkIns.value.activity).forEach((date) => mark(date, 'activity'));
    }
    return days;
  }
}
