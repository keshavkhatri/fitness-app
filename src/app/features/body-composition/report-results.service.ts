import { Injectable, inject } from '@angular/core';

import { BodyCompositionHistoryService } from '../../core/body-composition/body-composition-history.service';
import { WeightHistoryService } from '../../core/body-measurements/weight-history.service';
import { BodyCompositionMetric, ReportedValue } from '../../domain/body-composition';
import { weightFromPounds } from '../../domain/fitness-profile';
import { HistorySuggestion, INBODY_AI_PROVENANCE, InBodyPrefill } from '../../domain/inbody-extraction';

/** An earlier test that was saved, with what was saved. */
export interface EarlierSaved {
  readonly date: string;
  readonly values: Readonly<Partial<Record<BodyCompositionMetric, ReportedValue>>>;
}

export interface WeighInItem {
  readonly date: string;
  readonly weight: ReportedValue | null | undefined;
}

/** What saving a whole reading did. */
export interface ReadingSaved {
  /** Assessments added (the report's own test and its earlier ones). */
  readonly assessments: number;
  readonly weighIns: number;
  /** Things that could not be saved (storage); nothing is retried. */
  readonly failed: number;
}

/**
 * Keeps what a read InBody report holds beyond its own test: the earlier tests of its history chart (each its own
 * assessment, as read) and the weights as weigh-ins on their dates. Used by the add-assessment page (after the user
 * reviewed the form) and by onboarding (the whole report, once the profile exists). A date that already has an
 * assessment, or a day that already has the same weight, is never added again. The profile is never touched.
 */
@Injectable({ providedIn: 'root' })
export class ReportResults {
  private readonly history = inject(BodyCompositionHistoryService);
  private readonly weights = inject(WeightHistoryService);

  /** Adds each earlier test as its own assessment, as read from the report. */
  async addEarlier(suggestions: readonly HistorySuggestion[]): Promise<{ readonly total: number; readonly saved: readonly EarlierSaved[] }> {
    const existing = await this.assessmentDates();
    const due = suggestions.filter((s) => !existing.has(s.date));
    const saved: EarlierSaved[] = [];
    for (const suggestion of due) {
      const result = await this.history.add({ date: suggestion.date, source: INBODY_AI_PROVENANCE, values: suggestion.values });
      if (result.ok) {
        saved.push({ date: suggestion.date, values: suggestion.values });
      }
    }
    return { total: due.length, saved };
  }

  /**
   * Records each weight as a weigh-in on its date, in the unit the report printed. A day that already has the same
   * weight is skipped, so saving the same report twice never doubles the weigh-ins.
   */
  async logWeights(items: readonly WeighInItem[]): Promise<{ readonly added: number; readonly failed: number }> {
    const due = items.filter((item): item is { date: string; weight: ReportedValue } => !!item.weight && (item.weight.unit === 'kg' || item.weight.unit === 'lb'));
    if (due.length === 0) {
      return { added: 0, failed: 0 };
    }
    if (this.weights.state().status !== 'ready') {
      await this.weights.load();
    }
    let added = 0;
    let failed = 0;
    for (const { date, weight } of due) {
      const state = this.weights.state();
      if (state.status !== 'ready') {
        failed++;
        continue;
      }
      const kilograms = weight.unit === 'lb' ? weightFromPounds(weight.value).kilograms : weight.value;
      if (state.entries.some((entry) => entry.date === date && Math.abs(entry.weight.kilograms - kilograms) < 0.05)) {
        continue;
      }
      const result = await this.weights.add({ weight: weight.value, unitSystem: weight.unit === 'lb' ? 'imperial' : 'metric', date });
      if (result.ok) {
        added++;
      } else {
        failed++;
      }
    }
    return { added, failed };
  }

  /**
   * Onboarding: everything the report read, as read: its own test (on its printed date, or today without one), every
   * earlier test, and (optionally) the weights as weigh-ins. The user can check or change all of it later.
   */
  async saveReading(prefill: InBodyPrefill, options: { readonly logWeights: boolean }): Promise<ReadingSaved> {
    const values = Object.fromEntries(
      Object.entries(prefill.assessment.values).flatMap(([metric, p]) => (p.kind === 'prefilled' ? [[metric, p.value]] : [])),
    ) as Partial<Record<BodyCompositionMetric, ReportedValue>>;
    const date = prefill.assessment.date.kind === 'prefilled' ? prefill.assessment.date.value : this.history.today();
    let assessments = 0;
    let failed = 0;
    let main: WeighInItem | null = null;
    if (Object.keys(values).length > 0 && !(await this.assessmentDates()).has(date)) {
      const result = await this.history.add({ date, source: INBODY_AI_PROVENANCE, values });
      if (result.ok) {
        assessments++;
        main = { date, weight: values.weight };
      } else {
        failed++;
      }
    }
    const earlier = await this.addEarlier(prefill.history);
    assessments += earlier.saved.length;
    failed += earlier.total - earlier.saved.length;
    let weighIns = 0;
    if (options.logWeights) {
      const logged = await this.logWeights([...(main ? [main] : []), ...earlier.saved.map((s) => ({ date: s.date, weight: s.values.weight }))]);
      weighIns = logged.added;
      failed += logged.failed;
    }
    return { assessments, weighIns, failed };
  }

  private async assessmentDates(): Promise<ReadonlySet<string>> {
    if (this.history.state().status !== 'ready') {
      await this.history.load();
    }
    const state = this.history.state();
    return new Set(state.status === 'ready' ? state.assessments.map((a) => a.date) : []);
  }
}
