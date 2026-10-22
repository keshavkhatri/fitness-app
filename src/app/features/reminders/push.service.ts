import { Injectable, Injector, effect, inject, signal } from '@angular/core';

import { AUTH_API_BASE_URL, AUTH_FETCH } from '../../core/auth/auth-api';
import { AuthService } from '../../core/auth/auth.service';
import { PUSH_DEVICE } from './push-device';
import { ReminderService } from './reminder.service';

const TIMEOUT_MS = 15_000;

export type PushTestResult = 'sent' | 'no-device' | 'too-soon' | 'failed';

/**
 * Push notifications from the server (Firebase Cloud Messaging), for what the phone can't know by itself.
 * This phone is registered while someone is signed in AND reminders are on with the system permission
 * granted (the same consent the local reminders use); otherwise it is removed. Sign-out removes it with
 * the ending session, so the next person on the phone never gets the previous account's pushes.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly device = inject(PUSH_DEVICE);
  private readonly auth = inject(AuthService);
  private readonly reminders = inject(ReminderService);
  private readonly base = inject(AUTH_API_BASE_URL);
  private readonly fetch = inject(AUTH_FETCH);
  private readonly injector = inject(Injector);

  /** This install's Firebase token, once Firebase gave one. */
  private token: string | null = null;
  private registeredFor: string | null = null;
  /** The phone is registered with the server for the signed-in account. */
  readonly registered = signal(false);
  readonly available = this.device.available && this.base !== null;
  private started = false;

  /** Call once at startup. */
  start(): void {
    if (!this.available || this.started) {
      return;
    }
    this.started = true;
    this.device.onToken((token) => {
      this.token = token;
      this.registeredFor = null;
      void this.sync();
    });
    this.auth.onSignOut((sessionToken) => this.remove(sessionToken));
    effect(() => {
      // Re-evaluated when the account, the reminder switch or the permission changes.
      this.auth.state();
      this.reminders.settings();
      this.reminders.permission();
      void this.sync();
    }, { injector: this.injector });
  }

  private wanted(): boolean {
    return this.auth.state().status === 'signed-in' && this.reminders.settings().enabled && this.reminders.permission() === 'granted';
  }

  private async sync(): Promise<void> {
    if (!this.wanted()) {
      if (this.registered() && this.token) {
        const session = await this.auth.token();
        if (session) {
          await this.remove(session);
        }
      }
      return;
    }
    if (!this.token) {
      await this.device.register().catch(() => undefined);
      return;
    }
    const user = this.auth.user()?.id ?? null;
    if (this.registeredFor === user && this.registered()) {
      return;
    }
    const session = await this.auth.token();
    if (!session) {
      return;
    }
    const response = await this.post('/v1/push/devices', session, { token: this.token, platform: this.device.platform });
    if (response?.ok) {
      this.registeredFor = user;
      this.registered.set(true);
    }
  }

  private async remove(sessionToken: string): Promise<void> {
    if (!this.token) {
      return;
    }
    this.registered.set(false);
    this.registeredFor = null;
    await this.post('/v1/push/devices/remove', sessionToken, { token: this.token });
  }

  /** Asks the server to push a test to this account's phones. */
  async sendTest(): Promise<PushTestResult> {
    const session = await this.auth.token();
    // An empty JSON body: Google's front end refuses a POST without a Content-Length (411).
    const response = session ? await this.post('/v1/push/test', session, {}) : null;
    if (!response) {
      return 'failed';
    }
    if (response.status === 429) {
      return 'too-soon';
    }
    const body = (await response.json().catch(() => null)) as { sent?: number } | null;
    return response.ok ? ((body?.sent ?? 0) > 0 ? 'sent' : 'no-device') : 'failed';
  }

  private async post(path: string, sessionToken: string, body?: unknown): Promise<Response | null> {
    try {
      return await this.fetch(`${this.base}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${sessionToken}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'omit',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return null;
    }
  }
}
