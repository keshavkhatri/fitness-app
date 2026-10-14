import { WeightHistoryState } from '../../core/body-measurements/weight-history.service';
import { WEIGHT_ENTRY_RANGE_KG, WeightEntry, WeightEntryErrors, WeightEntryInput, weightHistory } from '../../domain/body-measurements';
import {
  BodyWeight,
  IsoCalendarDate,
  POUNDS_PER_KILOGRAM,
  UnitSystem,
  parseDecimalInput,
  parseIsoCalendarDate,
  weightInUnit,
  weightUnitLabel,
} from '../../domain/fitness-profile';
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

/** "Today", "Yesterday", "Thursday, Oct 1". */
function entryDateLabel(entry: WeightEntry, today: IsoCalendarDate): string {
  const date = parseIsoCalendarDate(entry.date);
  const todayDate = parseIsoCalendarDate(today);
  return date && todayDate ? dayLabel(date, todayDate) : entry.date;
}

/** "80.4 kg, Yesterday": how an entry is named in the delete confirmation. */
export function describeEntry(entry: WeightEntry, unitSystem: UnitSystem, today: IsoCalendarDate): string {
  return `${formatDisplayWeight(weightInUnit(entry.weight, unitSystem), unitSystem)}, ${entryDateLabel(entry, today)}`;
}

/** The "Use as profile weight" confirmation details, in the profile's unit. */
export interface ProfileWeightView {
  readonly measured: string;
  readonly current: string;
  readonly next: string;
}

export function toProfileWeightView(entry: WeightEntry, current: BodyWeight, unitSystem: UnitSystem, today: IsoCalendarDate): ProfileWeightView {
  const measured = entryDateLabel(entry, today);
  const now = formatDisplayWeight(weightInUnit(current, unitSystem), unitSystem);
  const next = formatDisplayWeight(weightInUnit(entry.weight, unitSystem), unitSystem);
  if (now !== next || current.kilograms === entry.weight.kilograms) {
    return { measured, current: now, next };
  }
  // Different stored weights that look the same at one decimal: show the actual change.
  return { measured, current: formatPreciseWeight(current, unitSystem), next: formatPreciseWeight(entry.weight, unitSystem) };
}

const twoDecimals = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "180.78 lb": only where one decimal would hide a difference. */
function formatPreciseWeight(weight: BodyWeight, unitSystem: UnitSystem): string {
  const value = unitSystem === 'metric' ? weight.kilograms : weight.kilograms * POUNDS_PER_KILOGRAM;
  return `${twoDecimals.format(value)} ${weightUnitLabel(unitSystem)}`;
}

// --- Fine-adjust slider -----------------------------------------------------------------------

export interface WeightSliderView {
  readonly min: number;
  readonly max: number;
  /** The typed weight when it's a number in the window, else the reference weight. */
  readonly value: number;
  /** Axis labels under the slider (whole numbers). */
  readonly ticks: readonly number[];
}

const SLIDER_HALF_WINDOW = 10;

/**
 * A ±10 (kg or lb) slider around a reference weight (the entry being edited,
 * or the latest recorded one), for nudging the typed value by 0.1. Null
 * without a reference: nothing is guessed. Bounds stay within the weights
 * the app accepts.
 */
export function weightSlider(reference: number | null, typed: string, unitSystem: UnitSystem): WeightSliderView | null {
  if (reference === null || !Number.isFinite(reference)) {
    return null;
  }
  const factor = unitSystem === 'imperial' ? POUNDS_PER_KILOGRAM : 1;
  const lowest = Math.ceil(WEIGHT_ENTRY_RANGE_KG.min * factor);
  const highest = Math.floor(WEIGHT_ENTRY_RANGE_KG.max * factor);
  const min = Math.max(lowest, Math.floor(reference) - SLIDER_HALF_WINDOW);
  const max = Math.min(highest, Math.ceil(reference) + SLIDER_HALF_WINDOW);
  const parsed = parseDecimalInput(typed);
  const value = parsed.kind === 'number' && parsed.value >= min && parsed.value <= max ? parsed.value : Math.min(max, Math.max(min, reference));
  const ticks = Array.from({ length: 6 }, (_, i) => Math.round(min + ((max - min) * i) / 5));
  return { min, max, value, ticks };
}
