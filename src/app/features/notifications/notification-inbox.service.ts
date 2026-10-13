import { Injectable, computed, inject, signal } from '@angular/core';

import { WeightHistoryService } from '../../core/body-measurements/weight-history.service';
import { DailyCheckInService } from '../../core/daily-check-in/daily-check-in.service';
import { NutritionRepository } from '../../core/nutrition/nutrition.repository';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { CLOCK, localIsoDate } from '../../core/time/clock';
import { WorkoutHistoryService } from '../../core/workout/workout-history.service';
import { WorkoutLogService } from '../../core/workout/workout-log.service';
import { WorkoutPlanService } from '../../core/workout/workout-plan.service';
import { IsoCalendarDate } from '../../domain/fitness-profile';
import { toHomeWorkout } from '../home/home-training';
import { toWorkoutScreen, weekdayIndexOf } from '../workout/workout-view-model';
import { AppNotification, buildNotifications } from './notifications';

const READ_KEY = 'fitness.notifications-read';
const SCHEMA_VERSION = 1;
/** Read ids kept (older ones belong to past days and never come back). */
const READ_LIMIT = 200;

/**
 * The notification inbox: builds today's reminders from the user's data and
 * remembers which were read. Each source is read independently; one that
 * fails simply contributes no reminder.
 */
@Injectable({ providedIn: 'root' })
export class NotificationInboxService {
  private readonly storage = inject(KeyValueStorage);
  private readonly clock = inject(CLOCK);
  private readonly logs = inject(WorkoutLogService);
  private readonly plans = inject(WorkoutPlanService);
  private readonly history = inject(WorkoutHistoryService);
  private readonly checkIns = inject(DailyCheckInService);
  private readonly food = inject(NutritionRepository);
  private readonly weights = inject(WeightHistoryService);

  private readonly current = signal<readonly AppNotification[]>([]);
  private readonly read = signal<ReadonlySet<string>>(new Set());

  readonly items = this.current.asReadonly();
  readonly unreadCount = computed(() => this.current().filter((n) => !this.read().has(n.id)).length);

  isRead(id: string): boolean {
    return this.read().has(id);
  }

  async refresh(): Promise<readonly AppNotification[]> {
    const now = this.clock();
    const today = localIsoDate(now);
    const [readIds, workout, trainedToday, checkIns, food, weighIn] = await Promise.all([
      this.loadRead(),
      settle(async () => {
        await this.logs.loadActive();
        return toHomeWorkout(toWorkoutScreen(await this.plans.load(), now), this.logs.active());
      }),
      settle(async () => ((await this.history.weekOverview())?.week[weekdayIndexOf(now)]?.workouts ?? 0) > 0),
      settle(() => this.checkIns.load()),
      settle(() => this.food.loadDay(today)),
      settle(async () => {
        await this.weights.load();
        const state = this.weights.state();
        return state.status === 'ready' ? (state.entries.at(-1)?.date ?? null) : undefined;
      }),
    ]);
    const items = buildNotifications({
      today,
      workout: workout ?? null,
      trainedToday: trainedToday ?? false,
      // Unreadable sources don't nag.
      recoveryCheckedIn: checkIns ? today in checkIns.recovery : true,
      foodLogged: food ? food.length > 0 : true,
      daysSinceWeighIn: weighIn === undefined ? 0 : weighIn === null ? null : daysBetween(weighIn, today),
    });
    this.read.set(readIds);
    this.current.set(items);
    return items;
  }

  /** Marks every current item read (the inbox was opened). A failed write keeps them unread. */
  async markAllRead(): Promise<void> {
    const ids = [...new Set([...this.read(), ...this.current().map((n) => n.id)])].slice(-READ_LIMIT);
    await this.storage.set(READ_KEY, JSON.stringify({ version: SCHEMA_VERSION, ids }));
    this.read.set(new Set(ids));
  }

  private async loadRead(): Promise<ReadonlySet<string>> {
    try {
      const stored = JSON.parse((await this.storage.get(READ_KEY)) ?? 'null') as { version?: unknown; ids?: unknown } | null;
      if (stored?.version === SCHEMA_VERSION && Array.isArray(stored.ids)) {
        return new Set(stored.ids.filter((id): id is string => typeof id === 'string'));
      }
    } catch {
      // Corrupt data: nothing read yet.
    }
    return new Set();
  }
}

async function settle<T>(read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read();
  } catch {
    return undefined;
  }
}

function daysBetween(from: IsoCalendarDate, to: IsoCalendarDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
