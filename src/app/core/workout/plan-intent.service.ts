import { Injectable, inject, signal } from '@angular/core';

import { KeyValueStorage } from '../storage/key-value-storage';

/** How the user said they want to train, on the last onboarding screen. */
export type PlanIntent = 'generated' | 'custom';

const STORAGE_KEY = 'stokeform.plan-intent';
const SCHEMA_VERSION = 1;

/**
 * The "Choose how to train" answer from first-run setup. Picking "Build my own" never opens the editor in
 * the middle of setup: it is remembered here and acted on once setup is finished (the plan screen opens on
 * Pro; afterwards a Pro user goes to the editor and a Free user sees a one-time card on the Train tab).
 * Cleared once acted on or dismissed. Device-local; holds no personal data.
 */
@Injectable({ providedIn: 'root' })
export class PlanIntentService {
  private readonly storage = inject(KeyValueStorage);
  private readonly state = signal<PlanIntent>('generated');
  private loaded: Promise<PlanIntent> | null = null;

  /** The remembered choice ('generated' until one is read or set). */
  readonly intent = this.state.asReadonly();

  load(): Promise<PlanIntent> {
    this.loaded ??= this.read().then((intent) => {
      this.state.set(intent);
      return intent;
    });
    return this.loaded;
  }

  /** Best effort: if storage fails the choice still holds for this session. */
  async set(intent: PlanIntent): Promise<void> {
    this.state.set(intent);
    this.loaded = Promise.resolve(intent);
    try {
      if (intent === 'custom') {
        await this.storage.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, intent }));
      } else {
        await this.storage.remove(STORAGE_KEY);
      }
    } catch {
      // Kept in memory only.
    }
  }

  /** Acted on (the editor opened) or dismissed (the Train tab card): never asked again. */
  clear(): Promise<void> {
    return this.set('generated');
  }

  private async read(): Promise<PlanIntent> {
    try {
      const stored = JSON.parse((await this.storage.get(STORAGE_KEY)) ?? 'null') as { version?: unknown; intent?: unknown } | null;
      return stored?.version === SCHEMA_VERSION && stored.intent === 'custom' ? 'custom' : 'generated';
    } catch {
      return 'generated';
    }
  }
}
