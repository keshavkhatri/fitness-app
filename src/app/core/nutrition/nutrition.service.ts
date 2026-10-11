import { Injectable, computed, inject, signal } from '@angular/core';

import { IsoCalendarDate, parseIsoCalendarDate, toIsoCalendarDate } from '../../domain/fitness-profile';
import {
  FoodEntry,
  FoodEntryErrors,
  FoodEntryInput,
  NutritionDay,
  NutritionTargets,
  NutritionWeek,
  createFoodEntry,
  nutritionDay,
  nutritionTargetsFrom,
  nutritionWeek,
  recentFoods,
  weekDates,
  weekStartOf,
  updateFoodEntry,
} from '../../domain/nutrition';
import { addDays } from '../../domain/workout-session';
import { FitnessAssessmentService } from '../calculations/fitness-assessment.service';
import { CLOCK, localIsoDate } from '../time/clock';
import { NutritionRepository } from './nutrition.repository';

/** Targets come from the fitness calculation engine; they are never stored here. */
export type TargetState =
  | { readonly kind: 'available'; readonly targets: NutritionTargets }
  | { readonly kind: 'no-profile' }
  | { readonly kind: 'unavailable' };

export type NutritionState =
  | { readonly status: 'loading'; readonly date: IsoCalendarDate }
  | { readonly status: 'ready'; readonly date: IsoCalendarDate; readonly day: NutritionDay; readonly targets: TargetState }
  /** Food logs couldn't be read (targets may still be known). */
  | { readonly status: 'error'; readonly date: IsoCalendarDate };

export type SaveResult =
  | { readonly ok: true; readonly entry: FoodEntry }
  | { readonly ok: false; readonly kind: 'invalid'; readonly errors: FoodEntryErrors }
  /** Nothing was saved (storage failed, or the entry no longer exists). */
  | { readonly ok: false; readonly kind: 'save-failed' };

/** One day's food log and targets, read without changing the selected day. */
export interface NutritionDaySnapshot {
  readonly date: IsoCalendarDate;
  readonly day: NutritionDay;
  readonly targets: TargetState;
}

/** One Monday–Sunday week of logged food, with the current targets (targets aren't stored per day). */
export interface NutritionWeekSnapshot {
  readonly today: IsoCalendarDate;
  readonly week: NutritionWeek;
  readonly targets: TargetState;
}

export type DeleteResult = { readonly ok: true } | { readonly ok: false };

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `food-${crypto.randomUUID()}`
    : `food-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** How far back Recent foods looks. */
const RECENT_FOOD_DAYS = 30;

const shift = (date: IsoCalendarDate, days: number): IsoCalendarDate => {
  const parsed = parseIsoCalendarDate(date);
  return parsed ? (toIsoCalendarDate(addDays(parsed, days)) ?? date) : date;
};

/**
 * Nutrition for one selected local day: logged food (from the repository)
 * and the day's calculated targets (from the calculation engine), kept
 * separate. Totals are derived from entries after every change.
 *
 * Loads: the latest request wins. Changes: serialized, each applied only
 * after it was saved, so the screen never claims a save that didn't happen.
 */
@Injectable({ providedIn: 'root' })
export class NutritionService {
  private readonly repository = inject(NutritionRepository);
  private readonly assessments = inject(FitnessAssessmentService);
  private readonly clock = inject(CLOCK);

  private readonly current = signal<NutritionState>({ status: 'loading', date: this.today() });
  private loadToken = 0;
  private queue: Promise<unknown> = Promise.resolve();

  readonly state = this.current.asReadonly();
  readonly selectedDate = computed(() => this.current().date);
  readonly isToday = computed(() => this.selectedDate() === this.today());

  /** The user's local calendar date now. */
  today(): IsoCalendarDate {
    return localIsoDate(this.clock());
  }

  /** Loads a day (default: the selected one). Future days are clamped to today. */
  async load(date: IsoCalendarDate = this.selectedDate()): Promise<void> {
    const target = date > this.today() ? this.today() : date;
    const token = ++this.loadToken;
    this.current.set({ status: 'loading', date: target });
    const snapshot = await this.snapshot(target).catch(() => null);
    if (token !== this.loadToken) {
      return; // a newer load started
    }
    this.current.set(snapshot ? { status: 'ready', ...snapshot } : { status: 'error', date: target });
  }

  /**
   * A day's log and targets (default: today) for other screens such as Home.
   * Leaves the selected day untouched. Rejects when food logs can't be read.
   */
  async snapshot(date: IsoCalendarDate = this.today()): Promise<NutritionDaySnapshot> {
    const [entries, targets] = await Promise.all([this.repository.loadDay(date), this.targets()]);
    return { date, day: nutritionDay(entries, date), targets };
  }

  /**
   * The Monday–Sunday week containing `date` (default: this week). A date in a
   * later week, or an invalid one, gives this week. Read-only: leaves the
   * selected day untouched. Rejects when food logs can't be read.
   */
  async week(date: IsoCalendarDate = this.today()): Promise<NutritionWeekSnapshot> {
    const today = this.today();
    const thisWeek = weekStartOf(today) as IsoCalendarDate;
    const requested = weekStartOf(date);
    const start = requested && requested <= thisWeek ? requested : thisWeek;
    const dates = weekDates(start);
    const last = dates[dates.length - 1] < today ? dates[dates.length - 1] : today;
    const [entries, targets] = await Promise.all([this.repository.loadRange(start, last), this.targets()]);
    return { today, week: nutritionWeek(entries, start, today) as NutritionWeek, targets };
  }

  goToPreviousDay(): Promise<void> {
    return this.load(shift(this.selectedDate(), -1));
  }

  goToNextDay(): Promise<void> {
    return this.load(shift(this.selectedDate(), 1));
  }

  goToToday(): Promise<void> {
    return this.load(this.today());
  }

  /** Recalculates targets (e.g. after a profile change) without touching food logs. */
  async refreshTargets(): Promise<void> {
    const targets = await this.targets();
    const state = this.current();
    if (state.status === 'ready') {
      this.current.set({ ...state, targets });
    }
  }

  /** An entry of a day, for editing. */
  async findEntry(date: IsoCalendarDate, id: string): Promise<FoodEntry | null | 'error'> {
    try {
      return (await this.repository.loadDay(date)).find((e) => e.id === id) ?? null;
    } catch {
      return 'error';
    }
  }

  /** Distinct foods logged in the last 30 days, newest first, to log again. Rejects when food logs can't be read. */
  async recentFoods(): Promise<FoodEntry[]> {
    const today = this.today();
    return recentFoods(await this.repository.loadRange(shift(today, -(RECENT_FOOD_DAYS - 1)), today));
  }

  add(input: FoodEntryInput, date: IsoCalendarDate): Promise<SaveResult> {
    return this.serialize(async () => {
      const created = createFoodEntry(input, { id: newId(), date, now: this.clock().toISOString() });
      if (!created.ok) {
        return { ok: false, kind: 'invalid', errors: created.error };
      }
      try {
        await this.repository.add(created.value);
      } catch {
        return { ok: false, kind: 'save-failed' };
      }
      this.applyToDay(date, (entries) => [...entries, created.value]);
      return { ok: true, entry: created.value };
    });
  }

  update(entry: FoodEntry, input: FoodEntryInput): Promise<SaveResult> {
    return this.serialize(async () => {
      const updated = updateFoodEntry(entry, input, this.clock().toISOString());
      if (!updated.ok) {
        return { ok: false, kind: 'invalid', errors: updated.error };
      }
      try {
        await this.repository.update(updated.value);
      } catch {
        return { ok: false, kind: 'save-failed' };
      }
      this.applyToDay(entry.date, (entries) => entries.map((e) => (e.id === entry.id ? updated.value : e)));
      return { ok: true, entry: updated.value };
    });
  }

  remove(entry: FoodEntry): Promise<DeleteResult> {
    return this.serialize(async () => {
      try {
        await this.repository.remove(entry.id);
      } catch {
        return { ok: false };
      }
      this.applyToDay(entry.date, (entries) => entries.filter((e) => e.id !== entry.id));
      return { ok: true };
    });
  }

  private async targets(): Promise<TargetState> {
    try {
      const current = await this.assessments.current();
      return current.kind === 'ready'
        ? { kind: 'available', targets: nutritionTargetsFrom(current.assessment) }
        : { kind: current.kind };
    } catch {
      return { kind: 'unavailable' };
    }
  }

  /** Recomputes the shown day from its entries after a saved change. */
  private applyToDay(date: IsoCalendarDate, change: (entries: readonly FoodEntry[]) => readonly FoodEntry[]): void {
    const state = this.current();
    if (state.status === 'ready' && state.date === date) {
      this.current.set({ ...state, day: nutritionDay(change(state.day.entries), date) });
    }
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
