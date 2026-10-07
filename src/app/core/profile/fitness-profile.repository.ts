import { Injectable, inject } from '@angular/core';

import { UserFitnessProfile, parseFitnessProfile } from '../../domain/fitness-profile';
import { KeyValueStorage } from '../storage/key-value-storage';

/**
 * Persistence boundary for the user's fitness profile.
 *
 * Today: `LocalFitnessProfileRepository` (device storage). Later: an API-backed
 * implementation provided in its place; callers don't change.
 */
@Injectable({ providedIn: 'root', useFactory: () => new LocalFitnessProfileRepository(inject(KeyValueStorage)) })
export abstract class FitnessProfileRepository {
  /** Resolves null when no (valid) profile exists. */
  abstract load(): Promise<UserFitnessProfile | null>;
  /** Rejects if the profile could not be saved. */
  abstract save(profile: UserFitnessProfile): Promise<void>;
}

const STORAGE_KEY = 'fitness.profile';
/**
 * v2: `age` replaced by `dateOfBirth`. v1 data can't be migrated (no birth
 * date) and is treated as "no profile", which re-runs onboarding.
 */
const SCHEMA_VERSION = 2;

interface StoredProfile {
  version: number;
  profile: unknown;
}

/**
 * TODO(security, before production): this stores personal and body data
 * (date of birth, sex, height, weight, goals) as plain JSON in device storage
 * (localStorage) without encryption. Review profile persistence before
 * release: e.g. platform secure storage / encrypted store for local data, and
 * the server as source of truth once the API exists. See README "Production
 * readiness".
 */
export class LocalFitnessProfileRepository implements FitnessProfileRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  async load(): Promise<UserFitnessProfile | null> {
    const raw = await this.storage.get(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      const stored = JSON.parse(raw) as Partial<StoredProfile>;
      // Future schema versions add a migration step here.
      return stored.version === SCHEMA_VERSION ? parseFitnessProfile(stored.profile) : null;
    } catch {
      return null;
    }
  }

  async save(profile: UserFitnessProfile): Promise<void> {
    const stored: StoredProfile = { version: SCHEMA_VERSION, profile };
    await this.storage.set(STORAGE_KEY, JSON.stringify(stored));
  }
}
