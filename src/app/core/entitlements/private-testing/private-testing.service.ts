import { Injectable, computed, inject, signal } from '@angular/core';

import { KeyValueStorage } from '../../storage/key-value-storage';
import { PRIVATE_TESTING_CONFIG } from './private-testing.config';

const STORAGE_KEY = 'stokeform.test-access';
const SCHEMA_VERSION = 1;

/** The outcome of typing a promo code. */
export type PromoResult = 'activated' | 'empty' | 'invalid' | 'unavailable';

/**
 * Temporary Pro access for private testers (friends and family), unlocked with a shared promo code.
 *
 * This is deliberately NOT billing: it never touches RevenueCat, is never reported as a purchase or a
 * subscription, and EntitlementService keeps it apart from a real subscription (`source`). It exists only when
 * the build turns private testing on (PRIVATE_TESTING_CONFIG); otherwise `available` and `active` are false.
 *
 * The code is reusable (redeeming never consumes it), and the switch is stored on the device only, so
 * reinstalling just means typing the code again. Be clear about what this is: a shared secret inside the app,
 * which anyone with the build can read, and device storage a determined user can edit. It is fine for a small
 * group of trusted testers and unsuitable for protecting paid content from the public.
 */
@Injectable({ providedIn: 'root' })
export class PrivateTestingService {
  private readonly config = inject(PRIVATE_TESTING_CONFIG);
  private readonly storage = inject(KeyValueStorage);

  /** Whether this build offers a promo code at all. */
  readonly available = this.config.enabled && this.config.promoCode !== null;
  private readonly activated = signal(false);
  /** Test access is on right now (never true in a build without private testing). */
  readonly active = computed(() => this.available && this.activated());

  private restoring: Promise<void> | null = null;

  /** Reads the saved switch once. Safe to call repeatedly. */
  restore(): Promise<void> {
    if (!this.available) {
      return Promise.resolve();
    }
    this.restoring ??= (async () => {
      try {
        const saved = JSON.parse((await this.storage.get(STORAGE_KEY)) ?? 'null') as { version?: unknown; active?: unknown } | null;
        this.activated.set(saved?.version === SCHEMA_VERSION && saved.active === true);
      } catch {
        // Unreadable storage means test access is off.
      }
    })();
    return this.restoring;
  }

  /** Checks a typed code (case and surrounding spaces don't matter). Turns test access on when it matches. */
  async redeem(input: string): Promise<PromoResult> {
    if (!this.available || this.config.promoCode === null) {
      return 'unavailable';
    }
    const typed = input.trim().toLowerCase();
    if (typed === '') {
      return 'empty';
    }
    if (typed !== this.config.promoCode.toLowerCase()) {
      return 'invalid';
    }
    await this.restore();
    this.activated.set(true);
    try {
      await this.storage.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, active: true }));
    } catch {
      // Still on for this session; it just won't survive a restart.
    }
    return 'activated';
  }

  /** Turns test access off, so the real entitlement decides again. Redeeming works again afterwards. */
  async deactivate(): Promise<void> {
    await this.restore();
    this.activated.set(false);
    try {
      await this.storage.remove(STORAGE_KEY);
    } catch {
      // Off for this session regardless.
    }
  }
}
