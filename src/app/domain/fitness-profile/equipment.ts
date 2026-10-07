import { EQUIPMENT_IDS, EquipmentId, TRAINING_LOCATIONS, TrainingLocation } from './fitness-profile.model';

/**
 * Equipment catalog. The exercise engine will later filter exercises by these
 * ids, so add new equipment here (and to `EQUIPMENT_IDS`) rather than in UI code.
 */
export interface EquipmentDefinition {
  readonly id: EquipmentId;
  /** Locations where this option is offered during onboarding. */
  readonly offeredAt: readonly TrainingLocation[];
  /** Selecting it clears every other selection (and vice versa). */
  readonly exclusive?: boolean;
}

const EVERYWHERE = TRAINING_LOCATIONS;
const GYM_SETTINGS: readonly TrainingLocation[] = ['gym', 'both'];

export const EQUIPMENT_CATALOG: readonly EquipmentDefinition[] = [
  { id: 'full-gym', offeredAt: GYM_SETTINGS },
  { id: 'dumbbells', offeredAt: EVERYWHERE },
  { id: 'barbells', offeredAt: EVERYWHERE },
  { id: 'cable-machine', offeredAt: GYM_SETTINGS },
  { id: 'machines', offeredAt: GYM_SETTINGS },
  { id: 'resistance-bands', offeredAt: EVERYWHERE },
  { id: 'pull-up-bar', offeredAt: EVERYWHERE },
  { id: 'bench', offeredAt: EVERYWHERE },
  { id: 'bodyweight-only', offeredAt: EVERYWHERE, exclusive: true },
  { id: 'other', offeredAt: EVERYWHERE },
];

const BY_ID = new Map(EQUIPMENT_CATALOG.map((item) => [item.id, item]));
const catalogOrder = (id: EquipmentId) => EQUIPMENT_IDS.indexOf(id);

/** Equipment options relevant to a training location (all options when unknown). */
export function equipmentOfferedAt(location: TrainingLocation | null): readonly EquipmentDefinition[] {
  return location ? EQUIPMENT_CATALOG.filter((item) => item.offeredAt.includes(location)) : EQUIPMENT_CATALOG;
}

/** Toggles one item, applying exclusivity rules. Result is de-duplicated and in catalog order. */
export function toggleEquipment(selection: readonly EquipmentId[], id: EquipmentId): EquipmentId[] {
  if (selection.includes(id)) {
    return selection.filter((item) => item !== id);
  }
  if (BY_ID.get(id)?.exclusive) {
    return [id];
  }
  return [...selection.filter((item) => !BY_ID.get(item)?.exclusive), id].sort(
    (a, b) => catalogOrder(a) - catalogOrder(b),
  );
}

/** Drops selections that are not offered at the given location (e.g. after switching Gym → Home). */
export function pruneEquipmentForLocation(
  selection: readonly EquipmentId[],
  location: TrainingLocation,
): EquipmentId[] {
  return selection.filter((id) => BY_ID.get(id)?.offeredAt.includes(location));
}
