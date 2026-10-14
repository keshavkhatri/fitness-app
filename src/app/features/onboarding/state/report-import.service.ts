import { Injectable, computed, inject, signal } from '@angular/core';

import { ExtractionFailure, InBodyExtractionClient, checkReportFile } from '../../../core/inbody/inbody-extraction.client';
import { CLOCK, localIsoDate } from '../../../core/time/clock';
import { InBodyExtraction, InBodyPrefill, ReportIssue, inBodyPrefill } from '../../../domain/inbody-extraction';

/** Why a report gave nothing to prefill: the request failed, or the model rejected the report. */
export type ReportImportFailure = ExtractionFailure | 'unsupported-report' | 'insufficient-readable-information';

/** A validated extraction and the suggestions mapped from it. */
export interface ReportReading {
  readonly extraction: InBodyExtraction;
  readonly prefill: InBodyPrefill;
}

export type ReportImportState =
  | { readonly status: 'empty' }
  | { readonly status: 'selected'; readonly file: File }
  | { readonly status: 'reading'; readonly file: File }
  | {
      readonly status: 'failed';
      readonly failure: ReportImportFailure;
      readonly reportIssues: readonly ReportIssue[];
      /** Kept when sending the same image again might work; null when another image is needed. */
      readonly file: File | null;
    }
  | { readonly status: 'read'; readonly reading: ReportReading };

/** Failures that sending the same image again can't fix. */
const NEEDS_ANOTHER_IMAGE: ReadonlySet<ReportImportFailure> = new Set<ReportImportFailure>([
  'unsupported-type',
  'too-large',
  'empty',
  'rejected-file',
  'unavailable',
  'unsupported-report',
  'insufficient-readable-information',
]);

const failed = (failure: ReportImportFailure, reportIssues: readonly ReportIssue[], file: File): ReportImportState => ({
  status: 'failed',
  failure,
  reportIssues,
  file: NEEDS_ANOTHER_IMAGE.has(failure) ? null : file,
});

/**
 * An InBody report upload: the chosen image, the request and its result.
 * Used by onboarding and by the new body-composition assessment page.
 * Provided per route/page and held in memory only: the
 * image, the extraction and the suggestions are never persisted, and the
 * image is let go as soon as it has been read. Nothing here changes the
 * draft; the basics, height and weight steps each offer theirs for review.
 */
/** The profile values a report can fill in, each confirmed on its own screen. */
export type PrefillField = 'sex' | 'height' | 'weight';
const PREFILL_FIELDS: readonly PrefillField[] = ['sex', 'height', 'weight'];

@Injectable()
export class ReportImport {
  private readonly client = inject(InBodyExtractionClient);
  private readonly clock = inject(CLOCK);
  private readonly state = signal<ReportImportState>({ status: 'empty' });
  /** Report values not yet confirmed on their screen (each screen starts from the report until then). */
  private readonly prefillPending = signal<ReadonlySet<PrefillField>>(new Set());
  /** Bumped on every read and reset, so a late answer for an abandoned read is dropped. */
  private attempt = 0;

  /** False when this build can't upload reports: only manual entry is offered. */
  readonly available = this.client.available;
  readonly current = this.state.asReadonly();
  readonly reading = computed(() => {
    const state = this.state();
    return state.status === 'read' ? state.reading : null;
  });
  /** True from a successful read until the user confirms that value on its screen. */
  isPrefillPending(field: PrefillField): boolean {
    return this.prefillPending().has(field);
  }

  /** Takes a newly chosen image, if the app can tell it's usable. Ignored while reading. */
  choose(file: File): void {
    if (this.state().status === 'reading') {
      return;
    }
    const problem = checkReportFile(file);
    this.state.set(problem ? { status: 'failed', failure: problem, reportIssues: [], file: null } : { status: 'selected', file });
  }

  /** Sends the chosen image to be read. No-op without one, or while a read is running. */
  async read(): Promise<void> {
    const state = this.state();
    const file = state.status === 'selected' || state.status === 'failed' ? state.file : null;
    if (!file) {
      return;
    }
    const attempt = ++this.attempt;
    this.state.set({ status: 'reading', file });
    const result = await this.client.extract(file).catch(() => ({ ok: false, failure: 'service' }) as const);
    if (attempt !== this.attempt) {
      return;
    }
    if (!result.ok) {
      this.state.set(failed(result.failure, [], file));
      return;
    }
    const prefill = inBodyPrefill(result.extraction, localIsoDate(this.clock()));
    if (prefill.kind === 'no-prefill') {
      this.state.set(failed(prefill.outcome, prefill.reportIssues, file));
      return;
    }
    this.state.set({ status: 'read', reading: { extraction: result.extraction, prefill } });
    this.prefillPending.set(new Set(PREFILL_FIELDS));
  }

  /** The user confirmed a prefilled value: from now on the draft is its source. */
  markConfirmed(field: PrefillField): void {
    this.prefillPending.update((pending) => {
      const next = new Set(pending);
      next.delete(field);
      return next;
    });
  }

  /** Forgets the image and any reading (e.g. on switching to manual entry). */
  reset(): void {
    this.attempt++;
    this.state.set({ status: 'empty' });
    this.prefillPending.set(new Set());
  }
}
