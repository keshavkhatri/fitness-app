import { Injectable, inject } from '@angular/core';

import { UserFitnessProfile } from '../../domain/fitness-profile';
import { KeyValueStorage } from '../storage/key-value-storage';
import { FitnessProfileService } from './fitness-profile.service';

/**
 * Where the user is in first-run setup:
 * - needs-onboarding: no valid profile yet
 * - needs-assessment: profile exists, but its starting assessment hasn't been reviewed
 * - complete: profile exists and its assessment was reviewed
 */
export type OnboardingStatus = 'needs-onboarding' | 'needs-assessment' | 'complete';

const STORAGE_KEY = 'fitness.assessment-reviewed';
const SCHEMA_VERSION = 1;

/**
 * Derives first-run status from the stored profile plus a small "assessment
 * reviewed" marker. The marker only records the profile's `updatedAt` (no
 * health data), so a changed profile is assessed again automatically.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingStatusService {
  private readonly profiles = inject(FitnessProfileService);
  private readonly storage = inject(KeyValueStorage);

  async status(): Promise<OnboardingStatus> {
    const profile = await this.profiles.load();
    if (!profile) {
      return 'needs-onboarding';
    }
    return (await this.reviewedProfileVersion()) === profile.updatedAt ? 'complete' : 'needs-assessment';
  }

  /** Records that the assessment for this profile version was reviewed. Best effort. */
  async markAssessmentReviewed(profile: UserFitnessProfile): Promise<void> {
    try {
      await this.storage.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, profileUpdatedAt: profile.updatedAt }));
    } catch {
      // Worst case the assessment is shown again next launch.
    }
  }

  private async reviewedProfileVersion(): Promise<string | null> {
    try {
      const stored = JSON.parse((await this.storage.get(STORAGE_KEY)) ?? 'null') as Record<string, unknown> | null;
      return stored?.['version'] === SCHEMA_VERSION && typeof stored['profileUpdatedAt'] === 'string'
        ? stored['profileUpdatedAt']
        : null;
    } catch {
      return null;
    }
  }
}
