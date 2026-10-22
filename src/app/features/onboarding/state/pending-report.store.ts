import { Injectable, inject } from '@angular/core';

import { KeyValueStorage } from '../../../core/storage/key-value-storage';
import { InBodyExtraction, parseInBodyExtraction } from '../../../domain/inbody-extraction';

const STORAGE_KEY = 'stokeform.onboarding-report';
const SCHEMA_VERSION = 1;

/** A report read during setup, kept until the profile exists. */
export interface PendingReport {
  readonly extraction: InBodyExtraction;
  readonly logWeights: boolean;
}

/**
 * Carries the InBody report read during first-run setup across the account step. Signing in leaves the page
 * (Google's sign-in, the email confirmation link), and the reading itself only lives in memory, so without this the
 * report would be gone by the time the profile is created. Written only when the user chose to keep the report,
 * read once the profile exists, then deleted. The image is never stored, only the values read from it; they are
 * checked again on reading, like any answer from the server.
 *
 * TODO(security, before production): like the onboarding answers, stored unencrypted on the device.
 */
@Injectable({ providedIn: 'root' })
export class PendingReportStore {
  private readonly storage = inject(KeyValueStorage);

  async save(report: PendingReport): Promise<void> {
    try {
      await this.storage.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...report }));
    } catch {
      // Best effort: without it the report can still be added later from You.
    }
  }

  async load(): Promise<PendingReport | null> {
    try {
      const stored = JSON.parse((await this.storage.get(STORAGE_KEY)) ?? 'null') as Record<string, unknown> | null;
      if (!stored || stored['version'] !== SCHEMA_VERSION) {
        return null;
      }
      const parsed = parseInBodyExtraction(stored['extraction']);
      return parsed.ok ? { extraction: parsed.value, logWeights: stored['logWeights'] !== false } : null;
    } catch {
      return null;
    }
  }

  async clear(): Promise<void> {
    await this.storage.remove(STORAGE_KEY).catch(() => undefined);
  }
}
