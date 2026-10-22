import { Injectable, inject, signal } from '@angular/core';

import { DailyCheckInService } from '../../core/daily-check-in/daily-check-in.service';
import { WeightHistoryService } from '../../core/body-measurements/weight-history.service';
import { NutritionRepository } from '../../core/nutrition/nutrition.repository';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { ActivityStreakService } from '../../core/streak/activity-streak.service';
import { CLOCK, localIsoDate } from '../../core/time/clock';
import { WorkoutLogService } from '../../core/workout/workout-log.service';
import { WorkoutPlanService } from '../../core/workout/workout-plan.service';
import { activeDayStreak } from '../../domain/daily-check-in';
import { PlannedReminder, ReminderFacts, ReminderSettings, parseReminderSettings, planReminders } from '../../domain/reminders';
import { scheduleWeek, toWorkoutScreen, weekdayIndexOf } from '../workout/workout-view-model';
import { REMINDER_DEVICE, ReminderPermission } from './reminder-device';

const SETTINGS_KEY = 'stokeform.reminder-settings';
/** The ids this app put on the device's schedule last time, so re-planning can replace them. */
const SCHEDULED_KEY = 'stokeform.reminders-scheduled';
const SCHEMA_VERSION = 1;
const DAYS_AHEAD = 7;

/**
 * Reminders on the device (training days, a workout left open, a streak at risk, the weekly weigh-in, meals,
 * the recovery check-in). Off until the user turns them on (the system permission is asked then). Whenever the
 * app opens or comes back, `refresh()` re-plans the next days from what is recorded now and replaces the
 * schedule, so a reminder for something already done is gone.
 */
@Injectable({ providedIn: 'root' })
export class ReminderService {
  private readonly device = inject(REMINDER_DEVICE);
  private readonly storage = inject(KeyValueStorage);
  private readonly clock = inject(CLOCK);
  private readonly plans = inject(WorkoutPlanService);
  private readonly logs = inject(WorkoutLogService);
  private readonly checkIns = inject(DailyCheckInService);
  private readonly weights = inject(WeightHistoryService);
  private readonly food = inject(NutritionRepository);
  private readonly streaks = inject(ActivityStreakService);

  private readonly current = signal<ReminderSettings>(parseReminderSettings(null));
  private queue: Promise<unknown> = Promise.resolve();

  /** Reminders can exist on this build (the Android app). */
  readonly available = this.device.available;
  readonly settings = this.current.asReadonly();
  readonly permission = signal<ReminderPermission>('prompt');
  /** What the last re-plan put on the schedule (soonest first). */
  readonly planned = signal<readonly PlannedReminder[]>([]);

  async load(): Promise<ReminderSettings> {
    try {
      const stored = JSON.parse((await this.storage.get(SETTINGS_KEY)) ?? 'null') as { version?: number; settings?: unknown } | null;
      this.current.set(parseReminderSettings(stored?.version === SCHEMA_VERSION ? stored.settings : null));
    } catch {
      this.current.set(parseReminderSettings(null));
    }
    this.permission.set(this.available ? await this.device.permission().catch(() => 'prompt' as const) : 'denied');
    return this.current();
  }

  /** Saves the settings and re-plans. Turning reminders on asks for the system permission first. */
  async save(next: ReminderSettings): Promise<ReminderPermission> {
    let settings = next;
    if (next.enabled && this.available) {
      const permission = (await this.device.permission()) === 'granted' ? 'granted' : await this.device.requestPermission();
      this.permission.set(permission);
      if (permission !== 'granted') {
        settings = { ...next, enabled: false };
      }
    }
    await this.storage.set(SETTINGS_KEY, JSON.stringify({ version: SCHEMA_VERSION, settings }));
    this.current.set(settings);
    await this.refresh();
    return this.permission();
  }

  /** Re-plans the coming days and replaces what this app scheduled. Never throws (reminders are a convenience). */
  refresh(): Promise<void> {
    const next = this.queue.then(() => this.replan()).catch(() => undefined);
    this.queue = next;
    return next;
  }

  private async replan(): Promise<void> {
    if (!this.available) {
      return;
    }
    const previous = await this.scheduledIds();
    await this.device.cancel(previous);
    const settings = this.current();
    if (!settings.enabled || (await this.device.permission()) !== 'granted') {
      await this.storage.set(SCHEDULED_KEY, '[]');
      this.planned.set([]);
      return;
    }
    const now = this.clock();
    const planned = planReminders(settings, await this.facts(now), now);
    await this.device.schedule(planned);
    await this.storage.set(SCHEDULED_KEY, JSON.stringify(planned.map((r) => r.id)));
    this.planned.set(planned);
  }

  private async scheduledIds(): Promise<number[]> {
    try {
      const ids = JSON.parse((await this.storage.get(SCHEDULED_KEY)) ?? '[]') as unknown;
      return Array.isArray(ids) ? ids.filter((id): id is number => Number.isInteger(id)) : [];
    } catch {
      return [];
    }
  }

  /** What is recorded and planned now (each source on its own: one that can't be read is just unknown). */
  private async facts(now: Date): Promise<ReminderFacts> {
    const today = localIsoDate(now);
    const [state, active, checkIns, food, activity] = await Promise.all([
      this.plans.load(),
      this.logs.loadActive().catch(() => null),
      this.checkIns.load().catch(() => null),
      this.food.loadDay(today).catch(() => []),
      this.streaks.activity().catch(() => new Map()),
      this.weights.load().catch(() => undefined),
    ]);
    const screen = toWorkoutScreen(state, now);
    const week = state.kind === 'ready' ? scheduleWeek(state.plan) : [];
    const titles = new Map(screen.kind === 'ready' ? screen.week.filter((d) => d.sessionId).map((d) => [d.sessionId as string, d.session.kind === 'rest' ? '' : d.session.title]) : []);
    const days = Array.from({ length: DAYS_AHEAD }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const session = week[weekdayIndexOf(date)] ?? null;
      return {
        date: localIsoDate(date),
        session: session ? { id: session.id, kind: session.kind, title: titles.get(session.id) ?? 'Your workout' } : null,
      };
    });
    const weights = this.weights.state();
    const latestWeighIn = weights.status === 'ready' ? [...weights.entries].sort((a, b) => b.date.localeCompare(a.date))[0] : undefined;
    const dayNumber = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;
    const lastSet = active?.exercises.flatMap((e) => e.sets.map((s) => s.completedAt)).filter((t): t is string => !!t).sort().pop();
    const todayKinds = activity.get(today);
    return {
      days,
      trainedToday: !!todayKinds?.has('workout'),
      foodLoggedToday: food.length > 0,
      recoveryToday: !!checkIns?.recovery[today],
      activeToday: !!todayKinds && todayKinds.size > 0,
      streak: activeDayStreak(new Set(activity.keys()), today),
      daysSinceWeighIn: latestWeighIn ? Math.round(dayNumber(today) - dayNumber(latestWeighIn.date)) : null,
      openWorkout: active
        ? { sessionId: active.source.sessionId, title: titles.get(active.source.sessionId) ?? 'Your workout', lastActivityAt: new Date(lastSet ?? active.startedAt) }
        : null,
    };
  }
}
