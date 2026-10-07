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

  /** Loads the profile once; later calls reuse the result. */
  load(): Promise<UserFitnessProfile | null> {
    this.loadPromise ??= this.repository.load().then(
      (profile) => {
        this.state.set(profile);
        return profile;
      },
      () => {
        // Allow a retry on the next call rather than caching the failure.
        this.loadPromise = null;
        return null;
      },
    );
    return this.loadPromise;
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
