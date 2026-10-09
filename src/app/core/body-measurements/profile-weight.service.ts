import { Injectable, inject } from '@angular/core';

import { WeightEntry, profileWeightChange } from '../../domain/body-measurements';
import { BodyWeight, UnitSystem, UserFitnessProfile } from '../../domain/fitness-profile';
import { FitnessProfileService } from '../profile/fitness-profile.service';
import { CLOCK } from '../time/clock';
import { WeightHistoryRepository } from './weight-history.repository';

/** Why a measurement can't be used as the profile weight right now. */
export type ProfileWeightUnavailable =
  | 'no-profile'
  /** The saved profile couldn't be read. */
  | 'profile-unavailable'
  /** The weight history couldn't be read. */
  | 'history-unavailable'
  /** The entry no longer exists (e.g. deleted elsewhere). */
  | 'entry-missing'
  /** The entry's weight or date isn't usable for the profile. */
  | 'entry-invalid';

/** What using this measurement would do, for the confirmation. Nothing is saved. */
export type ProfileWeightPreview =
  | {
      readonly kind: 'ready' | 'same';
      readonly entry: WeightEntry;
      /** The weight saved in the profile now. */
      readonly current: BodyWeight;
      readonly unitSystem: UnitSystem;
    }
  | { readonly kind: ProfileWeightUnavailable };

export type ProfileWeightResult =
  | { readonly ok: true; readonly kind: 'updated'; readonly profile: UserFitnessProfile }
  /** The profile already had this weight: nothing was written. */
  | { readonly ok: true; readonly kind: 'unchanged' }
  /** `save-failed`: storage rejected the write; the saved profile is unchanged. */
  | { readonly ok: false; readonly kind: ProfileWeightUnavailable | 'save-failed' };

type Resolved =
  | { readonly kind: 'ok'; readonly profile: UserFitnessProfile; readonly entry: WeightEntry }
  | { readonly kind: ProfileWeightUnavailable };

/**
 * Sets the profile's current weight from a recorded measurement, only when
 * the user explicitly asks (the history itself never changes the profile).
 *
 * The entry and profile are re-read for every request, and updates are
 * serialized, so a stale or deleted entry is never applied and a repeated
 * request finds the weight already saved. The profile is written only through
 * FitnessProfileService (whose cache every profile-derived screen reads);
 * the history entry is never written here.
 */
@Injectable({ providedIn: 'root' })
export class ProfileWeightService {
  private readonly history = inject(WeightHistoryRepository);
  private readonly profiles = inject(FitnessProfileService);
  private readonly clock = inject(CLOCK);

  private queue: Promise<unknown> = Promise.resolve();

  async preview(entryId: string): Promise<ProfileWeightPreview> {
    const resolved = await this.resolve(entryId);
    if (resolved.kind !== 'ok') {
      return resolved;
    }
    const { profile, entry } = resolved;
    const change = profileWeightChange(profile, entry, this.clock().toISOString());
    if (change.kind === 'invalid') {
      return { kind: 'entry-invalid' };
    }
    return { kind: change.kind === 'same' ? 'same' : 'ready', entry, current: profile.weight, unitSystem: profile.unitSystem };
  }

  apply(entryId: string): Promise<ProfileWeightResult> {
    return this.serialize(async () => {
      const resolved = await this.resolve(entryId);
      if (resolved.kind !== 'ok') {
        return { ok: false, kind: resolved.kind };
      }
      const change = profileWeightChange(resolved.profile, resolved.entry, this.clock().toISOString());
      if (change.kind === 'invalid') {
        return { ok: false, kind: 'entry-invalid' };
      }
      if (change.kind === 'same') {
        return { ok: true, kind: 'unchanged' };
      }
      try {
        await this.profiles.save(change.profile);
      } catch {
        return { ok: false, kind: 'save-failed' };
      }
      return { ok: true, kind: 'updated', profile: change.profile };
    });
  }

  private async resolve(entryId: string): Promise<Resolved> {
    let profile: UserFitnessProfile | null;
    try {
      profile = await this.profiles.refresh();
    } catch {
      return { kind: 'profile-unavailable' };
    }
    if (!profile) {
      return { kind: 'no-profile' };
    }
    let entries: WeightEntry[];
    try {
      entries = await this.history.list();
    } catch {
      return { kind: 'history-unavailable' };
    }
    const entry = entries.find((e) => e.id === entryId);
    return entry ? { kind: 'ok', profile, entry } : { kind: 'entry-missing' };
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
