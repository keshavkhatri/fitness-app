import { WeightHistoryState } from '../../core/body-measurements/weight-history.service';
import { weightRangeSummary } from '../../domain/body-measurements';
import { IsoCalendarDate, weightUnitLabel } from '../../domain/fitness-profile';
import { formatChange } from '../body-weight/weight-history-view-model';
import { trendDateLabel } from '../body-weight/weight-trend-view-model';

/**
 * Home's weight tile: the latest recorded weight and the last 30 days of
 * weigh-ins, from the domain's weightRangeSummary. The change is the
 * difference between two recordings (never called progress), so it is shown
 * in neutral copy.
 */
export type HomeWeightView =
  | {
      readonly kind: 'ready';
      /** "78.4" */
      readonly value: string;
      /** "kg" / "lb" */
      readonly unit: string;
      /** "Today", "Yesterday", "Monday, Oct 5" */
      readonly dateLabel: string;
      /** "−1.2 kg · 30 days"; null with fewer than two weigh-ins in the last 30 days. */
      readonly change: string | null;
      /**
       * Sparkline points in a 0–100 × 0–100 box (y down), oldest first; only
       * recorded measurements, no smoothing. Empty with fewer than two.
       */
      readonly points: readonly { readonly x: number; readonly y: number }[];
      readonly accessibleLabel: string;
    }
  | { readonly kind: 'empty' }
  | { readonly kind: 'error' };

const oneDecimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function toHomeWeight(state: WeightHistoryState, today: IsoCalendarDate): HomeWeightView | null {
  if (state.status === 'loading') {
    return null;
  }
  if (state.status === 'error') {
    return { kind: 'error' };
  }
  const { entries, unitSystem } = state;
  const recent = weightRangeSummary(entries, '30d', today, unitSystem);
  const all = recent ?? weightRangeSummary(entries, 'all', today, unitSystem);
  if (!all) {
    return { kind: 'empty' };
  }
  const latest = all.latest;
  const unit = weightUnitLabel(unitSystem);
  const value = oneDecimal.format(latest.value);
  const dateLabel = trendDateLabel(latest.entry.date, today);
  const many = recent !== null && recent.points.length > 1;
  const change = many ? (recent.netChange === 0 ? 'No change' : formatChange(recent.netChange, unitSystem)) : null;

  let points: { x: number; y: number }[] = [];
  if (many) {
    const values = recent.points.map((p) => p.value);
    const min = Math.min(...values);
    const span = Math.max(...values) - min;
    const last = values.length - 1;
    // 10–90 vertically so the end dot isn't clipped; a flat line sits in the middle.
    points = values.map((v, i) => ({ x: (i / last) * 100, y: span === 0 ? 50 : 90 - ((v - min) / span) * 80 }));
  }

  const spokenUnit = unitSystem === 'imperial' ? 'pounds' : 'kilograms';
  const changeText = change ? ` Change over the last 30 days: ${change.replace(unit, spokenUnit)}.` : '';
  return {
    kind: 'ready',
    value,
    unit,
    dateLabel,
    change: change ? `${change} · 30 days` : null,
    points,
    accessibleLabel: `Body weight ${value} ${spokenUnit}, recorded ${dateLabel}.${changeText} Open weight history.`,
  };
}
