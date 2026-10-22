import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';

import { SECRET_STORE } from '../auth/session-store';
import { TrackedKeyValueStorage } from '../sync/tracked-key-value-storage';
import { EncryptedKeyValueStorage } from './encrypted-key-value-storage';

/**
 * Small persistence seam for device-local preferences (theme, units, flags).
 *
 * The API is async on purpose: native stores such as Capacitor Preferences
 * are async, so moving off localStorage later only means providing a new
 * implementation, e.g. `{ provide: KeyValueStorage, useClass: CapacitorKeyValueStorage }`.
 *
 * Not intended for user data that must sync with the backend.
 */
@Injectable({
  providedIn: 'root',
  // On the phone every value is encrypted, with the key in the Android Keystore-backed secure store. The web build
  // (development in a browser) has no secure store that outlives the tab, so it stays plain there. On top, the
  // time each piece of data changed is recorded, for cloud sync (core/sync).
  useFactory: () =>
    new TrackedKeyValueStorage(
      Capacitor.isNativePlatform() ? new EncryptedKeyValueStorage(new LocalKeyValueStorage(), inject(SECRET_STORE)) : new LocalKeyValueStorage(),
    ),
})
export abstract class KeyValueStorage {
  abstract get(key: string): Promise<string | null>;
  /** Rejects when the value could not be persisted. */
  abstract set(key: string, value: string): Promise<void>;
  abstract remove(key: string): Promise<void>;
  /** Every stored key (e.g. to erase the app's data). */
  abstract keys(): Promise<string[]>;
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

  async keys(): Promise<string[]> {
    try {
      return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k): k is string => k !== null);
    } catch {
      return [];
    }
  }
}
