import { Injectable, inject } from '@angular/core';

import { CalorieCheckIn, calorieCheckIn, checkInPeriod } from '../../domain/calorie-check-in';
import { IsoCalendarDate, UnitSystem, UserFitnessProfile } from '../../domain/fitness-profile';
import { WeightHistoryRepository } from '../body-measurements/weight-history.repository';
import { FITNESS_CALCULATION_CONFIG } from '../calculations/calculation-config.token';
import { NutritionRepository } from '../nutrition/nutrition.repository';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { OnboardingStatusService } from '../profile/onboarding-status.service';
import { CLOCK, localCalendarDateOf, localIsoDate } from '../time/clock';

export interface CheckInSnapshot {
  readonly today: IsoCalendarDate;
  readonly unitSystem: UnitSystem;
  readonly checkIn: CalorieCheckIn;
}

/** What the user confirmed: the proposal as it was shown. */
export interface ConfirmedProposal {
  readonly maintenanceKcal: number;
  readonly targetKcal: number;
}

export type CheckInChangeResult =
  | { readonly ok: true; readonly targetKcal: number | null }
  /**
   * Nothing was saved: the data or profile changed since the proposal was
   * shown (or there is no longer a proposal / calibration). `snapshot` is the
   * fresh check-in, when it could be read.
   */
  | { readonly ok: false; readonly kind: 'changed'; readonly snapshot: CheckInSnapshot | null }
  /** Storage rejected the write (or the profile couldn't be read); the saved profile is unchanged. */
  | { readonly ok: false; readonly kind: 'save-failed' };

/**
 * Calorie Check-in: reads the user's own food log, weight history and
 * profile, and applies a proposal ONLY when the user confirms it.
 *
 * Calorie targets are never stored on their own: an accepted proposal is
 * saved as the profile's `energyCalibration` (an observed maintenance
 * figure) through FitnessProfileService, and the calculation engine derives
 * the target and macros from it, with its safety rules, everywhere targets
 * are shown. The plan isn't affected (calibration isn't a programming input).
 *
 * Changes are serialized, re-read the saved profile and re-run the check-in
 * first, so a stale proposal (data changed, another tab) is never applied.
 */
@Injectable({ providedIn: 'root' })
export class CalorieCheckInService {
  private readonly profiles = inject(FitnessProfileService);
  private readonly onboarding = inject(OnboardingStatusService);
  private readonly nutrition = inject(NutritionRepository);
  private readonly weights = inject(WeightHistoryRepository);
  private readonly calculation = inject(FITNESS_CALCULATION_CONFIG);
  private readonly clock = inject(CLOCK);
  private queue: Promise<unknown> = Promise.resolve();

  /** Read-only. Rejects when food or weight history can't be read. */
  async load(): Promise<CheckInSnapshot> {
    return (await this.read()).snapshot;
  }

  /** Saves the confirmed proposal, if it is still exactly what the data proposes now. */
  accept(confirmed: ConfirmedProposal): Promise<CheckInChangeResult> {
    return this.serialize(async () => {
      const fresh = await this.readOrNull();
      if (!fresh) {
        return { ok: false, kind: 'save-failed' };
      }
      const { snapshot, profile } = fresh;
      const rec = snapshot.checkIn.recommendation;
      if (!profile || rec.kind !== 'adjust' || rec.maintenanceKcal !== confirmed.maintenanceKcal || rec.targetKcal !== confirmed.targetKcal) {
        return { ok: false, kind: 'changed', snapshot };
      }
      const now = this.clock().toISOString();
      const { period } = snapshot.checkIn;
      const saved = await this.save(profile, {
        ...profile,
        energyCalibration: { maintenanceKcal: rec.maintenanceKcal, observedFrom: period.from, observedTo: period.to, acceptedAt: now },
        updatedAt: now,
      });
      return saved ? { ok: true, targetKcal: rec.targetKcal } : { ok: false, kind: 'save-failed' };
    });
  }

  /** Removes an accepted calibration: targets return to the formula estimate. */
  useFormula(): Promise<CheckInChangeResult> {
    return this.serialize(async () => {
      let profile: UserFitnessProfile | null;
      try {
        profile = await this.profiles.refresh();
      } catch {
        return { ok: false, kind: 'save-failed' };
      }
      if (!profile?.energyCalibration) {
        return { ok: false, kind: 'changed', snapshot: (await this.readOrNull())?.snapshot ?? null };
      }
      const { energyCalibration: _removed, ...rest } = profile;
      const saved = await this.save(profile, { ...rest, updatedAt: this.clock().toISOString() });
      return saved ? { ok: true, targetKcal: null } : { ok: false, kind: 'save-failed' };
    });
  }

  /**
   * Saves through the profile service (whose cache every target screen reads).
   * The user reviewed the new target in the confirmation, so a previously
   * reviewed assessment stays reviewed for the new profile version (as for units).
   */
  private async save(before: UserFitnessProfile, after: UserFitnessProfile): Promise<boolean> {
    const wasReviewed = (await this.onboarding.status().catch(() => null)) === 'complete' && before.updatedAt !== after.updatedAt;
    try {
      await this.profiles.save(after);
    } catch {
      return false;
    }
    if (wasReviewed) {
      await this.onboarding.markAssessmentReviewed(after);
    }
    return true;
  }

  private async read(): Promise<{ snapshot: CheckInSnapshot; profile: UserFitnessProfile | null }> {
    const today = localIsoDate(this.clock());
    const period = checkInPeriod(today);
    if (!period) {
      throw new Error('invalid date');
    }
    const [profile, foods, weights] = await Promise.all([
      this.profiles.refresh().catch(() => 'unavailable' as const),
      this.nutrition.loadRange(period.from, period.to),
      this.weights.list(),
    ]);
    const checkIn = calorieCheckIn({ today, localDateOf: localCalendarDateOf, profile, foods, weights, calculation: this.calculation });
    if (!checkIn) {
      throw new Error('invalid date');
    }
    const usable = profile === 'unavailable' ? null : profile;
    return { snapshot: { today, unitSystem: usable?.unitSystem ?? 'metric', checkIn }, profile: usable };
  }

  private readOrNull() {
    return this.read().catch(() => null);
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
