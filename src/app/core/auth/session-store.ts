import { InjectionToken } from '@angular/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Capacitor } from '@capacitor/core';

/**
 * Where the session token (and, during Google sign-in, the PKCE verifier) is kept. Never
 * localStorage, which any script on the page can read and which survives indefinitely:
 * - Android / iOS: the platform's secure store (Android Keystore-backed storage, iOS Keychain).
 * - Web (development in a browser): sessionStorage, cleared when the tab closes.
 */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const PREFIX = 'pulseform.auth.';

class NativeSecretStore implements SecretStore {
  async get(key: string): Promise<string | null> {
    try {
      return await SecureStorage.getItem(PREFIX + key);
    } catch {
      return null;
    }
  }
  set(key: string, value: string): Promise<void> {
    return SecureStorage.setItem(PREFIX + key, value);
  }
  async remove(key: string): Promise<void> {
    await SecureStorage.removeItem(PREFIX + key).catch(() => undefined);
  }
}

class SessionStorageSecretStore implements SecretStore {
  async get(key: string): Promise<string | null> {
    try {
      return sessionStorage.getItem(PREFIX + key);
    } catch {
      return null;
    }
  }
  async set(key: string, value: string): Promise<void> {
    sessionStorage.setItem(PREFIX + key, value);
  }
  async remove(key: string): Promise<void> {
    try {
      sessionStorage.removeItem(PREFIX + key);
    } catch {
      // Nothing to remove.
    }
  }
}

export const SECRET_STORE = new InjectionToken<SecretStore>('SECRET_STORE', {
  providedIn: 'root',
  factory: () => (Capacitor.isNativePlatform() ? new NativeSecretStore() : new SessionStorageSecretStore()),
});

/** A test double (the specs inject it). */
export class MemorySecretStore implements SecretStore {
  readonly values = new Map<string, string>();
  async get(key: string) {
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.values.set(key, value);
  }
  async remove(key: string) {
    this.values.delete(key);
  }
}
