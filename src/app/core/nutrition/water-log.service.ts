import { Injectable, computed, inject, signal } from '@angular/core';

import { IsoCalendarDate, UnitSystem } from '../../domain/fitness-profile';
import { WaterLog, isValidWater, parseWaterLog, waterGlassMl, waterGoalMl } from '../../domain/nutrition';
import { WeightHistoryService } from '../body-measurements/weight-history.service';
import { GoalsService } from '../goals/goals.service';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { KeyValueStorage } from '../storage/key-value-storage';
import { CLOCK, localIsoDate } from '../time/clock';

const STORAGE_KEY = 'fitness.water-log';
const SCHEMA_VERSION = 1;
/** Before water was part of nutrition it was kept with the daily check-ins (read once, to carry it over). */
const LEGACY_KEY = 'fitness.daily-check-ins';

/**
 * Water drunk per local day (part of nutrition, next to the food log): one total per day in ml, kept on the
 * device like the other logs. Writes are serialized, so quick taps on "+" add up. TODO(security, before
 * production): stored unencrypted, see README "Production readiness".
 */
@Injectable({ providedIn: 'root' })
export class WaterLogService {
  private readonly storage = inject(KeyValueStorage);
  private readonly clock = inject(CLOCK);
  private readonly weights = inject(WeightHistoryService);
  private readonly profiles = inject(FitnessProfileService);
  private readonly goals = inject(GoalsService);
  private readonly current = signal<WaterLog>({});
  private queue: Promise<unknown> = Promise.resolve();

  /** Every day with water logged. */
  readonly days = this.current.asReadonly();
  /** The person's units (metric until a profile says otherwise): imperial shows fluid ounces. */
  readonly unit = computed<UnitSystem>(() => this.profiles.profile()?.unitSystem ?? 'metric');
  /** One glass in ml for those units (what "+" adds). */
  readonly glassMl = computed(() => waterGlassMl(this.unit()));

  today(): IsoCalendarDate {
    return localIsoDate(this.clock());
  }

  /** The day's total in ml (0 when nothing was logged). */
  on(date: IsoCalendarDate): number {
    return this.current()[date] ?? 0;
  }

  async load(): Promise<WaterLog> {
    const log = await this.read();
    this.current.set(log);
    return log;
  }

  /** Replaces the day's total. Rejects amounts outside 0–10,000 ml and failed writes (state unchanged). */
  set(date: IsoCalendarDate, ml: number): Promise<void> {
    if (!isValidWater(ml)) {
      return Promise.reject(new RangeError('Water must be a whole number of millilitres from 0 to 10,000.'));
    }
    return this.serialize(async () => {
      const next = { ...(await this.read()), [date]: ml };
      await this.storage.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, days: next }));
      this.current.set(next);
    });
  }

  /** Adds to the day's total (a glass), capped at the daily maximum. */
  add(date: IsoCalendarDate, ml: number): Promise<void> {
    return this.serialize(async () => {
      const log = await this.read();
      const next = { ...log, [date]: Math.min(10_000, Math.max(0, (log[date] ?? 0) + ml)) };
      await this.storage.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, days: next }));
      this.current.set(next);
    });
  }

  /**
   * The daily goal in ml: the one the person set, else worked out from the latest weigh-in (or the profile's
   * weight; 3 L without either), in glasses of their units. Also loads the profile (for the units) and the goals.
   */
  async goalMl(): Promise<number> {
    const [profile] = await Promise.all([this.profiles.load().catch(() => null), this.goals.load(), this.weights.load().catch(() => undefined)]);
    const override = this.goals.waterOverrideMl();
    if (override !== null) {
      return override;
    }
    const s = this.weights.state();
    const latest = s.status === 'ready' ? [...s.entries].sort((x, y) => y.date.localeCompare(x.date))[0] : undefined;
    return waterGoalMl(latest?.weight.kilograms ?? profile?.weight.kilograms ?? null, this.unit());
  }

  private async read(): Promise<WaterLog> {
    try {
      const raw = await this.storage.get(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as { version?: unknown; days?: unknown };
        return stored?.version === SCHEMA_VERSION ? parseWaterLog(stored.days) : {};
      }
      const legacy = JSON.parse((await this.storage.get(LEGACY_KEY)) ?? 'null') as { water?: unknown } | null;
      return parseWaterLog(legacy?.water);
    } catch {
      return {};
    }
  }

  private serialize(task: () => Promise<void>): Promise<void> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
