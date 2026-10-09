import { Injectable, computed, inject, signal } from '@angular/core';

import { UserFitnessProfile } from '../../domain/fitness-profile';
import { FitnessProfileRepository } from './fitness-profile.repository';

/**
 * App-wide access to the current user's fitness profile.
 *
 * Loads once from the repository and caches the result in a signal. The
 * presence of a profile is what "onboarding completed" means.
 */
@Injectable({ providedIn: 'root' })
export class FitnessProfileService {
  private readonly repository = inject(FitnessProfileRepository);
  private readonly state = signal<UserFitnessProfile | null>(null);
  private loadPromise: Promise<UserFitnessProfile | null> | null = null;

  readonly profile = this.state.asReadonly();
  readonly hasProfile = computed(() => this.state() !== null);

  /** Loads the profile once; later calls reuse the result. Resolves null if it couldn't be read. */
  load(): Promise<UserFitnessProfile | null> {
    return this.read().catch(() => null);
  }

  /** Like `load()`, but rejects when the profile couldn't be read (so callers can tell that from "no profile"). */
  read(): Promise<UserFitnessProfile | null> {
    this.loadPromise ??= this.repository.load().then(
      (profile) => {
        this.state.set(profile);
        return profile;
      },
      (error: unknown) => {
        // Allow a retry on the next call rather than caching the failure.
        this.loadPromise = null;
        throw error;
      },
    );
    return this.loadPromise;
  }

  /**
   * Like `read()`, but always reads the saved profile again (and caches it),
   * so a read-modify-write isn't based on a copy that's stale because storage
   * changed outside this service (e.g. another tab).
   */
  refresh(): Promise<UserFitnessProfile | null> {
    this.loadPromise = null;
    return this.read();
  }

  async hasCompletedOnboarding(): Promise<boolean> {
    return (await this.load()) !== null;
  }

  async save(profile: UserFitnessProfile): Promise<void> {
    await this.repository.save(profile);
    this.state.set(profile);
    this.loadPromise = Promise.resolve(profile);
  }
}
