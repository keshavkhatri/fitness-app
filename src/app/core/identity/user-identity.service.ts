import { Injectable, inject, signal } from '@angular/core';

import { KeyValueStorage } from '../storage/key-value-storage';

const STORAGE_KEY = 'fitness.identity';
const SCHEMA_VERSION = 1;
export const NAME_MAX_LENGTH = 40;
/** A small square JPEG/PNG data URL (the You tab resizes photos before saving). */
export const PHOTO_MAX_LENGTH = 300_000;

/** How the app addresses the user: a display name and an optional photo. Not part of the fitness profile. */
export interface UserIdentity {
  readonly name: string | null;
  readonly photo: string | null;
}

export const EMPTY_IDENTITY: UserIdentity = { name: null, photo: null };

export function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const name = value.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_LENGTH);
  return name || null;
}

export function isValidPhoto(value: unknown): value is string {
  return typeof value === 'string' && value.length <= PHOTO_MAX_LENGTH && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

export function parseUserIdentity(value: unknown): UserIdentity {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== SCHEMA_VERSION) {
    return EMPTY_IDENTITY;
  }
  const { name, photo } = value as Record<string, unknown>;
  return { name: normalizeName(name), photo: isValidPhoto(photo) ? photo : null };
}

/**
 * Display name and photo, device-local. TODO(security, before production):
 * stored unencrypted with the other personal data (README "Production readiness").
 */
@Injectable({ providedIn: 'root' })
export class UserIdentityService {
  private readonly storage = inject(KeyValueStorage);
  private readonly current = signal<UserIdentity>(EMPTY_IDENTITY);

  readonly identity = this.current.asReadonly();

  async load(): Promise<UserIdentity> {
    let value = EMPTY_IDENTITY;
    try {
      value = parseUserIdentity(JSON.parse((await this.storage.get(STORAGE_KEY)) ?? 'null'));
    } catch {
      // Corrupt data reads as empty.
    }
    this.current.set(value);
    return value;
  }

  /** Saves the name (blank clears it) and photo (null clears it). Rejects an invalid photo or a failed write. */
  async save(identity: { readonly name: string | null; readonly photo: string | null }): Promise<UserIdentity> {
    if (identity.photo !== null && !isValidPhoto(identity.photo)) {
      throw new RangeError('Unsupported or too large photo.');
    }
    const next: UserIdentity = { name: normalizeName(identity.name), photo: identity.photo };
    await this.storage.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...next }));
    this.current.set(next);
    return next;
  }
}
