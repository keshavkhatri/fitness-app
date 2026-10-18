import { Injectable, inject } from '@angular/core';
import { KeyValueStorage } from '../storage/key-value-storage';

const PENDING_KEY = 'stokeform.first-run-offer';
const CHOICE_KEY = 'stokeform.plan-choice';
const SCHEMA_VERSION = 1;

export type PlanChoice = 'free';

/**
 * The premium offer at the end of first-run setup is shown once: a marker is set when a new profile is
 * created through onboarding, and cleared by the user's choice. Existing users (whose profile predates
 * the marker) never get it as a gate; they can open it from You. Neither record holds health data.
 */
@Injectable({ providedIn: 'root' })
export class FirstRunOfferService {
  private readonly storage = inject(KeyValueStorage);

  /** Called when onboarding has created a new profile. Best effort: if it fails, the offer is simply skipped. */
  async markPending(): Promise<void> {
    try {
      await this.storage.set(PENDING_KEY, JSON.stringify({ version: SCHEMA_VERSION }));
    } catch {
      // Not shown; the user can still open it from You.
    }
  }

  async isPending(): Promise<boolean> {
    try {
      const raw = JSON.parse((await this.storage.get(PENDING_KEY)) ?? 'null') as { version?: unknown } | null;
      return raw?.version === SCHEMA_VERSION;
    } catch {
      return false;
    }
  }

  /** Records the user's choice and stops the offer from being shown again as part of setup. */
  async choose(choice: PlanChoice, accountId: string | null): Promise<void> {
    try {
      await this.storage.set(CHOICE_KEY, JSON.stringify({ version: SCHEMA_VERSION, choice, accountId, at: new Date().toISOString() }));
    } finally {
      await this.storage.remove(PENDING_KEY);
    }
  }
}
