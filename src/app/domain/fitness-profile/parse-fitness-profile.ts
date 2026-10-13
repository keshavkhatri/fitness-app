import {
  BodyHeight,
  EnergyCalibration,
  BodyWeight,
  EquipmentId,
  GoalTarget,
  UserFitnessProfile,
  isActivityLevel,
  isEquipmentId,
  isPrimaryGoal,
  isSex,
  isTrainingDaysPerWeek,
  isTrainingExperience,
  isTrainingLocation,
  isUnitSystem,
} from './fitness-profile.model';
import { IsoCalendarDate, ageOn, calendarDateOf, compareCalendarDates, parseIsoCalendarDate } from './date-of-birth';
import { normalizeGoalTarget } from './goal-targets';
import { AGE_YEARS, HEIGHT_CM, MAINTENANCE_KCAL, WEIGHT_KG, isWithin } from './profile-rules';

/**
 * Runtime validation for profile data crossing a trust boundary (local
 * storage today, API responses later). Returns null instead of throwing so
 * callers can treat corrupt or outdated data as "no profile".
 */

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function parseBodyHeight(value: unknown): BodyHeight | null {
  return isRecord(value) && isFiniteNumber(value['centimeters']) && isWithin(value['centimeters'], HEIGHT_CM)
    ? { centimeters: value['centimeters'] }
    : null;
}

export function parseBodyWeight(value: unknown): BodyWeight | null {
  return isRecord(value) && isFiniteNumber(value['kilograms']) && isWithin(value['kilograms'], WEIGHT_KG)
    ? { kilograms: value['kilograms'] }
    : null;
}

/**
 * A valid "YYYY-MM-DD" date of birth that is not in the future and gives an
 * age within the supported range on `now`.
 */
export function parseDateOfBirth(value: unknown, now: Date = new Date()): IsoCalendarDate | null {
  const dob = parseIsoCalendarDate(value);
  if (!dob) {
    return null;
  }
  const today = calendarDateOf(now);
  return compareCalendarDates(dob, today) <= 0 && isWithin(ageOn(dob, today), AGE_YEARS) ? (value as string) : null;
}

/** Keeps known ids only, de-duplicated. */
export function parseEquipment(value: unknown): EquipmentId[] {
  return Array.isArray(value) ? [...new Set(value.filter(isEquipmentId))] : [];
}

export function parseGoalTarget(value: unknown): GoalTarget {
  return { targetWeight: isRecord(value) ? parseBodyWeight(value['targetWeight']) : null };
}

const withCalibration = (calibration: EnergyCalibration | null) => (calibration ? { energyCalibration: calibration } : {});

/** A valid accepted calibration, or null (an invalid one is dropped, so targets fall back to the formula). */
export function parseEnergyCalibration(value: unknown): EnergyCalibration | null {
  if (!isRecord(value)) {
    return null;
  }
  const { maintenanceKcal, observedFrom, observedTo, acceptedAt } = value;
  return Number.isInteger(maintenanceKcal) &&
    isWithin(maintenanceKcal as number, MAINTENANCE_KCAL) &&
    parseIsoCalendarDate(observedFrom) !== null &&
    parseIsoCalendarDate(observedTo) !== null &&
    (observedFrom as string) <= (observedTo as string) &&
    typeof acceptedAt === 'string' &&
    !Number.isNaN(Date.parse(acceptedAt))
    ? { maintenanceKcal: maintenanceKcal as number, observedFrom: observedFrom as string, observedTo: observedTo as string, acceptedAt }
    : null;
}

export function parseFitnessProfile(value: unknown, now: Date = new Date()): UserFitnessProfile | null {
  if (!isRecord(value)) {
    return null;
  }
  const { primaryGoal, sex, unitSystem, trainingExperience, trainingDaysPerWeek, trainingLocation, activityLevel } =
    value;
  const dateOfBirth = parseDateOfBirth(value['dateOfBirth'], now);
  const height = parseBodyHeight(value['height']);
  const weight = parseBodyWeight(value['weight']);
  const equipment = parseEquipment(value['equipment']);
  const updatedAt = value['updatedAt'];

  if (
    !isPrimaryGoal(primaryGoal) ||
    !isSex(sex) ||
    !isUnitSystem(unitSystem) ||
    !isTrainingExperience(trainingExperience) ||
    !isTrainingDaysPerWeek(trainingDaysPerWeek) ||
    !isTrainingLocation(trainingLocation) ||
    !isActivityLevel(activityLevel) ||
    dateOfBirth === null ||
    height === null ||
    weight === null ||
    equipment.length === 0 ||
    typeof updatedAt !== 'string'
  ) {
    return null;
  }

  return {
    primaryGoal,
    dateOfBirth,
    sex,
    height,
    weight,
    unitSystem,
    trainingExperience,
    trainingDaysPerWeek,
    trainingLocation,
    equipment,
    activityLevel,
    goalTarget: normalizeGoalTarget(primaryGoal, parseGoalTarget(value['goalTarget'])),
    ...withCalibration(parseEnergyCalibration(value['energyCalibration'])),
    updatedAt,
  };
}
