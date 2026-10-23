import { Injectable, inject, signal } from '@angular/core';

import {
  DailyCheckIns,
  EMPTY_CHECK_INS,
  RecoveryLevel,
  isRecoveryLevel,
  isValidSteps,
  parseDailyCheckIns,
} from '../../domain/daily-check-in';
import { IsoCalendarDate, parseIsoCalendarDate } from '../../domain/fitness-profile';
import { KeyValueStorage } from '../storage/key-value-storage';
import { CLOCK, localIsoDate } from '../time/clock';

const STORAGE_KEY = 'fitness.daily-check-ins';
const SCHEMA_VERSION = 1;

/**
 * Self-reported steps and recovery per local day (device-local today, like
 * the other logs; no health-app integration yet). TODO(security, before
 * production): stored unencrypted, see README "Production readiness".
 */
@Injectable({ providedIn: 'root' })
export class DailyCheckInService {
  private readonly storage = inject(KeyValueStorage);
  private readonly clock = inject(CLOCK);
  private readonly current = signal<DailyCheckIns>(EMPTY_CHECK_INS);

  readonly checkIns = this.current.asReadonly();

  today(): IsoCalendarDate {
    return localIsoDate(this.clock());
  }

  /** Re-reads storage (unknown versions read as empty, never overwritten until the next save). */
  async load(): Promise<DailyCheckIns> {
    const raw = await this.storage.get(STORAGE_KEY);
    let value = EMPTY_CHECK_INS;
    if (raw) {
      try {
        const stored = JSON.parse(raw) as { version?: unknown };
        if (stored?.version === SCHEMA_VERSION) {
          value = parseDailyCheckIns(stored);
        }
      } catch {
        // Corrupt data reads as empty.
      }
    }
    this.current.set(value);
    return value;
  }

  /** Replaces the day's steps. Rejects invalid values and failed writes (state unchanged). */
  async setSteps(date: IsoCalendarDate, steps: number): Promise<void> {
    if (!isValidSteps(steps)) {
      throw new RangeError('Steps must be a whole number from 0 to 100,000.');
    }
    const next = { ...this.current(), steps: { ...this.current().steps, [date]: steps } };
    await this.save(next);
  }

  /**
   * Takes step totals counted by the device (Health Connect): each day's value replaces what is stored for that day.
   * Days without steps (0) are skipped (the device has nothing to say), invalid values are ignored, and nothing is
   * written when nothing changed. Resolves with how many days changed.
   */
  async applyDeviceSteps(days: Readonly<Record<IsoCalendarDate, number>>): Promise<number> {
    const steps = { ...this.current().steps };
    let changed = 0;
    for (const [date, value] of Object.entries(days)) {
      if (parseIsoCalendarDate(date) && isValidSteps(value) && value > 0 && steps[date] !== value) {
        steps[date] = value;
        changed++;
      }
    }
    if (changed > 0) {
      await this.save({ ...this.current(), steps });
    }
    return changed;
  }

  /** Replaces the day's recovery check-in. */
  async setRecovery(date: IsoCalendarDate, level: RecoveryLevel): Promise<void> {
    if (!isRecoveryLevel(level)) {
      throw new RangeError('Unknown recovery level.');
    }
    const next = { ...this.current(), recovery: { ...this.current().recovery, [date]: level } };
    await this.save(next);
  }

  /** Marks the day's planned light activity as done (`sessionId` the plan's activity session), or clears it with null. */
  async setActivityDone(date: IsoCalendarDate, sessionId: string | null): Promise<void> {
    const { [date]: _previous, ...rest } = this.current().activity;
    const next = { ...this.current(), activity: sessionId ? { ...rest, [date]: sessionId } : rest };
    await this.save(next);
  }

  private async save(next: DailyCheckIns): Promise<void> {
    await this.storage.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...next }));
    this.current.set(next);
  }
}
