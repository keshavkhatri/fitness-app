import { Injectable, inject } from '@angular/core';

import { KeyValueStorage } from '../../../core/storage/key-value-storage';
import { EMPTY_DRAFT, OnboardingDraft, sanitizeDraft } from './onboarding-draft';
import { OnboardingStepId, isOnboardingStepId } from './onboarding-steps';

export interface OnboardingProgress {
  readonly stepId: OnboardingStepId;
  readonly draft: OnboardingDraft;
  /** True while the user is editing a section from the summary. */
  readonly editingFromSummary: boolean;
}

export const INITIAL_PROGRESS: OnboardingProgress = { stepId: 'welcome', draft: EMPTY_DRAFT, editingFromSummary: false };

const STORAGE_KEY = 'fitness.onboarding-progress';
/**
 * v2: basics store `dateOfBirth` instead of `age`; older progress restarts onboarding.
 * v3: basics are answered one screen at a time (partial). v2 progress reads the same way
 * (see LEGACY_STEPS). The questionnaire no longer asks for a name (it comes from the account);
 * a name saved in an older draft is still read, and only shown on the review's avatar.
 */
const SCHEMA_VERSION = 3;
const READABLE_VERSIONS: readonly unknown[] = [2, 3];
/** Steps that no longer exist, and where their saved progress resumes. */
const LEGACY_STEPS: Readonly<Record<string, OnboardingStepId>> = { name: 'basics' };

/**
 * Device-local, resumable onboarding progress. Holds only completed answers
 * (no half-typed text) and is deleted as soon as the profile is created, so
 * personal data isn't kept in two places.
 *
 * TODO(security, before production): in-progress answers include personal
 * data and are stored unencrypted, like the profile itself. Review together
 * with FitnessProfileRepository (see README "Production readiness").
 */
@Injectable({ providedIn: 'root' })
export class OnboardingProgressStore {
  private readonly storage = inject(KeyValueStorage);

  async load(): Promise<OnboardingProgress> {
    const raw = await this.storage.get(STORAGE_KEY);
    if (!raw) {
      return INITIAL_PROGRESS;
    }
    try {
      const stored = JSON.parse(raw) as Record<string, unknown>;
      if (!READABLE_VERSIONS.includes(stored['version'])) {
        return INITIAL_PROGRESS;
      }
      const savedStep = stored['stepId'];
      const legacyStep = typeof savedStep === 'string' && Object.hasOwn(LEGACY_STEPS, savedStep) ? LEGACY_STEPS[savedStep] : undefined;
      const stepId = isOnboardingStepId(savedStep) ? savedStep : (legacyStep ?? 'welcome');
      return {
        // A saved "finish" would mean the profile exists; restart safely otherwise.
        stepId: stepId === 'finish' ? 'summary' : stepId,
        draft: sanitizeDraft(stored['draft']),
        editingFromSummary: stored['editingFromSummary'] === true,
      };
    } catch {
      return INITIAL_PROGRESS;
    }
  }

  /** Best effort: losing resumability must never block onboarding. */
  async save(progress: OnboardingProgress): Promise<void> {
    try {
      await this.storage.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...progress }));
    } catch {
      // Ignore; the user can still finish in this session.
    }
  }

  clear(): Promise<void> {
    return this.storage.remove(STORAGE_KEY);
  }
}
