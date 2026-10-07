import { Injectable } from '@angular/core';

/**
 * Small persistence seam for device-local preferences (theme, units, flags).
 *
 * The API is async on purpose: native stores such as Capacitor Preferences
 * are async, so moving off localStorage later only means providing a new
 * implementation, e.g. `{ provide: KeyValueStorage, useClass: CapacitorKeyValueStorage }`.
 *
 * Not intended for user data that must sync with the backend.
 */
@Injectable({ providedIn: 'root', useFactory: () => new LocalKeyValueStorage() })
export abstract class KeyValueStorage {
  abstract get(key: string): Promise<string | null>;
  /** Rejects when the value could not be persisted. */
  abstract set(key: string, value: string): Promise<void>;
  abstract remove(key: string): Promise<void>;
}

/** Browser localStorage implementation. Read failures resolve null; write failures reject. */
export class LocalKeyValueStorage implements KeyValueStorage {
  async get(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  }

  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to remove if storage is unavailable.
    }
  }
}
