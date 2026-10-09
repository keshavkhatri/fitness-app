import { WeightHistoryState } from '../../core/body-measurements/weight-history.service';
import { WeightEntry, WeightEntryErrors, WeightEntryInput, weightHistory } from '../../domain/body-measurements';
import { IsoCalendarDate, UnitSystem, parseDecimalInput, parseIsoCalendarDate, weightInUnit, weightUnitLabel } from '../../domain/fitness-profile';
import { NUMBER_FORMAT_ERROR } from '../nutrition/nutrition-content';
import { weightRangeText } from '../onboarding/validation/onboarding-validation';
import { dayLabel } from '../workout/history/history-view-model';
import { WEIGHT_HISTORY_COPY } from './weight-history-content';

/**
 * Presentation for body-weight history. Ordering and differences come from
 * the domain (weightHistory); this only formats them in the user's unit.
 */

const copy = WEIGHT_HISTORY_COPY;
const oneDecimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "80.4 kg" / "177.2 lb" (always one decimal, as entered). */
export const formatDisplayWeight = (value: number, unitSystem: UnitSystem) => `${oneDecimal.format(value)} ${weightUnitLabel(unitSystem)}`;

/** "+0.4 kg" / "−0.7 kg" (a true minus sign), "0.0 kg" never shown: zero is "No change". */
export function formatChange(change: number, unitSystem: UnitSystem): string {
  const sign = change > 0 ? '+' : '−';
  return `${sign}${oneDecimal.format(Math.abs(change))} ${weightUnitLabel(unitSystem)}`;
}

export interface WeightRowView {
  readonly id: string;
  readonly dateLabel: string;
  readonly weight: string;
  /** "+0.4 kg since previous entry", "No change since previous entry", "First entry". */
  readonly change: string;
  readonly ariaLabel: string;
}

export type WeightHistoryScreen =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly rows: readonly WeightRowView[] };

export function toWeightHistoryScreen(state: WeightHistoryState, today: IsoCalendarDate): WeightHistoryScreen {
  if (state.status !== 'ready') {
    return { kind: state.status };
  }
  if (state.entries.length === 0) {
    return { kind: 'empty' };
  }
  const todayDate = parseIsoCalendarDate(today);
  return {
    kind: 'ready',
    rows: weightHistory(state.entries, state.unitSystem).map((item) => {
      const date = parseIsoCalendarDate(item.entry.date);
      const dateLabel = date && todayDate ? dayLabel(date, todayDate) : item.entry.date;
      const weight = formatDisplayWeight(item.displayWeight, state.unitSystem);
      const change =
        item.changeSincePrevious === null
          ? copy.list.firstEntry
          : item.changeSincePrevious === 0
            ? copy.list.noChange
            : `${formatChange(item.changeSincePrevious, state.unitSystem)} ${item.sameDayAsPrevious ? copy.list.sameDay : copy.list.sincePrevious}`;
      return { id: item.entry.id, dateLabel, weight, change, ariaLabel: `${copy.list.edit} ${weight}, ${dateLabel}. ${change}` };
    }),
  };
}

// --- Form --------------------------------------------------------------------------------

export interface WeightFormValues {
  /** As typed, in the unit system's unit. */
  readonly weight: string;
  /** YYYY-MM-DD from the date field. */
  readonly date: string;
}

export type WeightFormErrors = Readonly<Partial<Record<'weight' | 'date', string>>>;

export const emptyWeightForm = (today: IsoCalendarDate): WeightFormValues => ({ weight: '', date: today });

export const weightFormOf = (entry: WeightEntry, unitSystem: UnitSystem): WeightFormValues => ({
  weight: String(weightInUnit(entry.weight, unitSystem)),
  date: entry.date,
});

export interface ReadWeightForm {
  readonly input: WeightEntryInput;
  /** Set when the weight text was ambiguous ("1,234"); never saved. */
  readonly formatError: string | null;
}

/**
 * Typed text → domain input via the shared strict parser. When editing and
 * the weight text is unchanged, the stored kilograms are kept exactly (so
 * changing only the date doesn't re-round the weight through the display unit).
 */
export function readWeightForm(values: WeightFormValues, unitSystem: UnitSystem, original?: WeightEntry): ReadWeightForm {
  if (original && values.weight === weightFormOf(original, unitSystem).weight) {
    return { input: { weight: original.weight.kilograms, unitSystem: 'metric', date: values.date }, formatError: null };
  }
  const parsed = parseDecimalInput(values.weight);
  const weight = parsed.kind === 'number' ? parsed.value : parsed.kind === 'empty' ? null : Number.NaN;
  return {
    input: { weight, unitSystem, date: values.date },
    formatError: parsed.kind === 'ambiguous' ? NUMBER_FORMAT_ERROR : null,
  };
}

export function weightFormErrorsOf(errors: WeightEntryErrors, unitSystem: UnitSystem, formatError: string | null = null): WeightFormErrors {
  const e = copy.form.errors;
  const messages: { weight?: string; date?: string } = {};
  switch (errors.weight) {
    case 'required':
      messages.weight = e.weightRequired;
      break;
    case 'not-a-number':
      messages.weight = e.weightNumber;
      break;
    case 'out-of-range':
      messages.weight = e.weightRange(weightRangeText(unitSystem));
      break;
  }
  switch (errors.date) {
    case 'required':
      messages.date = e.dateRequired;
      break;
    case 'invalid-date':
      messages.date = e.dateInvalid;
      break;
    case 'future-date':
      messages.date = e.dateFuture;
      break;
  }
  return formatError ? { ...messages, weight: formatError } : messages;
}

/** "80.4 kg, Yesterday": how an entry is named in the delete confirmation. */
export function describeEntry(entry: WeightEntry, unitSystem: UnitSystem, today: IsoCalendarDate): string {
  const date = parseIsoCalendarDate(entry.date);
  const todayDate = parseIsoCalendarDate(today);
  const dateLabel = date && todayDate ? dayLabel(date, todayDate) : entry.date;
  return `${formatDisplayWeight(weightInUnit(entry.weight, unitSystem), unitSystem)}, ${dateLabel}`;
}
