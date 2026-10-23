import { Injectable, computed, inject, signal } from '@angular/core';

import { DailyCheckInService } from '../daily-check-in/daily-check-in.service';
import { KeyValueStorage } from '../storage/key-value-storage';
import { CLOCK } from '../time/clock';
import { HEALTH_STEPS_DEVICE } from './health-steps-device';

const STORAGE_KEY = 'stokeform.health-steps';
const SCHEMA_VERSION = 1;
/** How many days back each sync reads (today, and the days before it that may have been counted late). */
const DAYS = 7;

export type HealthStepsState =
  /** This build or phone has no Health Connect (typed steps only). */
  | 'unsupported'
  /** Available, and the person hasn't turned it on. */
  | 'off'
  /** On, with permission: steps come from the phone. */
  | 'connected'
  /** On, but the permission was refused or later taken away in Health Connect. */
  | 'needs-permission';

/**
 * Automatic step counting from Health Connect (Android 14+), read-only. The person turns it on in Settings, which
 * shows the system's permission dialog for steps only. While it's on, the app copies the phone's step totals for
 * the last 7 days into the daily check-ins (on launch, on return to the app and when Home opens): a day's total
 * from the phone replaces a typed number for that day. Typing still works for a day the phone has no steps for.
 * Nothing is ever written to Health Connect.
 */
@Injectable({ providedIn: 'root' })
export class HealthStepsService {
  private readonly device = inject(HEALTH_STEPS_DEVICE);
  private readonly storage = inject(KeyValueStorage);
  private readonly checkIns = inject(DailyCheckInService);
  private readonly clock = inject(CLOCK);

  private readonly enabled = signal(false);
  private readonly available = signal(false);
  private readonly granted = signal(false);
  private running: Promise<void> | null = null;
  private loaded: Promise<void> | null = null;

  /** This build can use Health Connect (the Android app): the Settings card shows. */
  readonly supported = this.device.supported;
  readonly busy = signal(false);
  /** When steps were last copied from the phone (ISO), or null. */
  readonly lastSyncedAt = signal<string | null>(null);
  /** The last sync failed (Health Connect couldn't be read). */
  readonly failed = signal(false);

  readonly state = computed<HealthStepsState>(() => {
    if (!this.supported || !this.available()) {
      return 'unsupported';
    }
    if (!this.enabled()) {
      return 'off';
    }
    return this.granted() ? 'connected' : 'needs-permission';
  });

  /** Reads the saved choice and what Health Connect allows now (call again to refresh). */
  load(): Promise<void> {
    this.loaded = this.refresh();
    return this.loaded;
  }

  /** Turns it on: asks for the Steps permission, then copies the steps. Resolves with whether it is on now. */
  async connect(): Promise<boolean> {
    this.busy.set(true);
    try {
      await this.ready();
      const status = await this.device.requestPermission().catch(() => ({ available: this.available(), granted: false }));
      this.available.set(status.available);
      this.granted.set(status.granted);
      // On even when refused: Settings then offers "allow in Health Connect"; nothing is read without permission.
      await this.saveEnabled(status.available);
      if (status.available && status.granted) {
        await this.sync();
      }
      return this.state() === 'connected';
    } finally {
      this.busy.set(false);
    }
  }

  /** Turns it off: steps stop being copied (typed steps stay). The permission itself is Health Connect's to take away. */
  async disconnect(): Promise<void> {
    await this.ready();
    await this.saveEnabled(false);
  }

  /** Opens this app's permission page in Health Connect (for a permission that was refused). */
  openSettings(): Promise<void> {
    return this.device.openSettings().catch(() => undefined);
  }

  /** Copies the phone's step totals for the last 7 days into the check-ins. Never throws. */
  sync(): Promise<void> {
    this.running ??= this.run().finally(() => (this.running = null));
    return this.running;
  }

  private async run(): Promise<void> {
    await this.ready();
    if (this.state() === 'unsupported' || !this.enabled()) {
      return;
    }
    // The permission can be taken away in Health Connect at any time.
    const status = await this.device.status().catch(() => null);
    if (status) {
      this.available.set(status.available);
      this.granted.set(status.granted);
    }
    if (this.state() !== 'connected') {
      return;
    }
    try {
      const days = await this.device.readSteps(DAYS);
      await this.checkIns.applyDeviceSteps(Object.fromEntries(days.map((d) => [d.date, d.steps])));
      this.lastSyncedAt.set(this.clock().toISOString());
      this.failed.set(false);
    } catch {
      this.failed.set(true);
    }
  }

  private ready(): Promise<void> {
    return (this.loaded ??= this.refresh());
  }

  private async refresh(): Promise<void> {
    try {
      const stored = JSON.parse((await this.storage.get(STORAGE_KEY)) ?? 'null') as { version?: unknown; enabled?: unknown } | null;
      this.enabled.set(stored?.version === SCHEMA_VERSION && stored.enabled === true);
    } catch {
      this.enabled.set(false);
    }
    const status = await this.device.status().catch(() => ({ available: false, granted: false }));
    this.available.set(status.available);
    this.granted.set(status.granted);
  }

  private async saveEnabled(enabled: boolean): Promise<void> {
    await this.storage.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, enabled })).catch(() => undefined);
    this.enabled.set(enabled);
  }
}
