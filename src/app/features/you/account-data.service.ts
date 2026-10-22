import { Injectable, InjectionToken, inject } from '@angular/core';

import { AuthResult } from '../../core/auth/auth-api';
import { AuthService } from '../../core/auth/auth.service';
import { KeyValueStorage } from '../../core/storage/key-value-storage';
import { ReminderService } from '../reminders/reminder.service';

/** Every key the app writes starts with one of these (the session itself is in secure storage, owned by AuthService). */
const APP_KEY_PREFIXES = ['fitness.', 'stokeform.'] as const;
/** A device preference, not personal data: kept, so the app doesn't flash to another theme. */
const KEPT_KEYS: ReadonlySet<string> = new Set(['fitness.theme-preference']);

/** Starts the app afresh (every service's in-memory copy goes with the old data). */
export const RESTART_APP = new InjectionToken<() => void>('RESTART_APP', {
  providedIn: 'root',
  factory: () => () => window.location.replace('/'),
});

/**
 * Deleting an account, and erasing what the app keeps on this phone. The fitness data (profile, plan, workouts,
 * food, water, weight, measurements, reports, check-ins) lives only on the phone, so deleting the account erases it
 * here too; scheduled reminders are cancelled first (their schedule is part of what is erased).
 */
@Injectable({ providedIn: 'root' })
export class AccountDataService {
  private readonly auth = inject(AuthService);
  private readonly storage = inject(KeyValueStorage);
  private readonly reminders = inject(ReminderService);
  private readonly restart = inject(RESTART_APP);

  /** Deletes the account on the server, then everything on this phone, then starts the app afresh. */
  async deleteAccount(): Promise<AuthResult<void>> {
    const result = await this.auth.deleteAccount();
    if (result.ok) {
      await this.eraseThisPhone();
      this.restart();
    }
    return result;
  }

  /** Erases the app's data on this phone (signed out, or after deleting the account), then starts afresh. */
  async eraseAndRestart(): Promise<void> {
    await this.eraseThisPhone();
    this.restart();
  }

  private async eraseThisPhone(): Promise<void> {
    // Reminders off first: cancelling them needs the schedule that is about to be erased.
    await this.reminders.save({ ...this.reminders.settings(), enabled: false }).catch(() => undefined);
    const keys = await this.storage.keys();
    await Promise.all(
      keys
        .filter((key) => APP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)) && !KEPT_KEYS.has(key))
        .map((key) => this.storage.remove(key)),
    );
  }
}
