import { Injectable, inject } from '@angular/core';

import { WeeklyReview, weeklyReview } from '../../domain/fitness-review';
import { IsoCalendarDate, UnitSystem } from '../../domain/fitness-profile';
import { shiftWeek, weekStartOf } from '../../domain/nutrition';
import { BodyCompositionHistoryRepository } from '../body-composition/body-composition-history.repository';
import { MeasurementHistoryRepository } from '../body-measurements/measurement-history.repository';
import { WeightHistoryRepository } from '../body-measurements/weight-history.repository';
import { NutritionService, TargetState } from '../nutrition/nutrition.service';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { CLOCK, localCalendarDateOf, localIsoDate } from '../time/clock';
import { WorkoutHistoryService } from '../workout/workout-history.service';
import { WorkoutPlanService } from '../workout/workout-plan.service';

export interface WeeklyReviewSnapshot {
  readonly today: IsoCalendarDate;
  readonly unitSystem: UnitSystem;
  readonly review: WeeklyReview;
  /** The nutrition targets as the dashboard knows them (for the "why no target" note); unavailable if nutrition couldn't be read. */
  readonly targets: TargetState;
}

/**
 * Builds the Weekly Fitness Review from the app's own records: workout
 * history and plan, the nutrition week and targets, weight history, tape
 * measurements and InBody reports. Read-only: nothing is saved or changed.
 * Each source is read on its own; one that fails leaves only its section
 * unavailable.
 */
@Injectable({ providedIn: 'root' })
export class FitnessReviewService {
  private readonly history = inject(WorkoutHistoryService);
  private readonly plans = inject(WorkoutPlanService);
  private readonly nutrition = inject(NutritionService);
  private readonly weights = inject(WeightHistoryRepository);
  private readonly measurements = inject(MeasurementHistoryRepository);
  private readonly composition = inject(BodyCompositionHistoryRepository);
  private readonly profiles = inject(FitnessProfileService);
  private readonly clock = inject(CLOCK);

  today(): IsoCalendarDate {
    return localIsoDate(this.clock());
  }

  /** Monday of the current week. */
  currentWeek(): IsoCalendarDate {
    return weekStartOf(this.today()) as IsoCalendarDate;
  }

  /** The week reviewed by default: the last complete Monday–Sunday week. */
  defaultWeek(): IsoCalendarDate {
    return shiftWeek(this.currentWeek(), -1) as IsoCalendarDate;
  }

  /** The review of the week containing `date`; a later week, or an invalid date, gives the current week. */
  async review(date: IsoCalendarDate = this.defaultWeek()): Promise<WeeklyReviewSnapshot> {
    const today = this.today();
    const requested = weekStartOf(date);
    const weekStart = requested && requested <= this.currentWeek() ? requested : this.currentWeek();
    const orNull = <T>(promise: Promise<T>) => promise.catch(() => null);

    const [history, plan, nutrition, weights, measurements, composition, profile] = await Promise.all([
      orNull(this.history.list()),
      orNull(this.plans.load()),
      orNull(this.nutrition.week(weekStart)),
      orNull(this.weights.list()),
      orNull(this.measurements.list()),
      orNull(this.composition.list()),
      orNull(this.profiles.load()),
    ]);
    const unitSystem = profile?.unitSystem ?? 'metric';
    const plannedPerWeek = plan?.kind === 'ready' ? plan.plan.sessions.filter((s) => s.kind === 'resistance').length : null;
    const targets: TargetState = nutrition?.targets ?? { kind: 'unavailable' };
    const valid = targets.kind === 'available' ? targets.targets : null;

    const review = weeklyReview({
      weekStart,
      today,
      unitSystem,
      localDateOf: localCalendarDateOf,
      training: history?.ok ? { logs: history.workouts, plannedPerWeek } : null,
      nutrition: nutrition
        ? {
            week: nutrition.week,
            calorieTarget: valid?.calories.kind === 'target' ? valid.calories.kcal : null,
            proteinTarget: valid?.macros.kind === 'target' ? valid.macros.proteinGrams : null,
          }
        : null,
      weights,
      measurements,
      bodyComposition: composition,
    }) as WeeklyReview;
    return { today, unitSystem, review, targets };
  }
}
