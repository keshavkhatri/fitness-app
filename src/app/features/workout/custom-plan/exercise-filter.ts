import {
  EXERCISE_CATEGORIES,
  EXERCISE_LIBRARY,
  Exercise,
  ExerciseCategory,
  MUSCLE_GROUPS,
  MuscleGroup,
  WORKOUT_EQUIPMENT,
  WorkoutEquipment,
} from '../../../domain/workout-programming';
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '../workout-content';

/** 'bodyweight' = needs no equipment (the catalog models it as an empty requirement list). */
export type EquipmentFilter = WorkoutEquipment | 'bodyweight';

export interface ExerciseQuery {
  readonly text: string;
  readonly muscle: MuscleGroup | null;
  readonly equipment: EquipmentFilter | null;
  /** The type chip (Strength, Core, Mobility, Cardio); null is All. */
  readonly category: ExerciseCategory | null;
}

export const NO_QUERY: ExerciseQuery = { text: '', muscle: null, equipment: null, category: null };

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Catalog exercises matching the query: every word of the text appears in the name or its muscle and
 * equipment labels, the muscle is one of its primary or secondary muscles, the equipment is one it
 * requires, and it has the category. Alphabetical by name.
 */
export function filterExercises(query: ExerciseQuery, catalog: readonly Exercise[] = EXERCISE_LIBRARY): Exercise[] {
  const words = normalize(query.text).split(' ').filter(Boolean);
  return catalog
    .filter((exercise) => {
      const name = normalize(
        [
          exercise.name,
          ...[...exercise.primaryMuscles, ...exercise.secondaryMuscles].map((m) => MUSCLE_LABELS[m]),
          ...(exercise.requires.length === 0 ? ['Bodyweight'] : exercise.requires.map((q) => EQUIPMENT_LABELS[q])),
        ].join(' '),
      );
      return (
        words.every((word) => name.includes(word)) &&
        (query.category === null || exercise.categories.includes(query.category)) &&
        (query.muscle === null || exercise.primaryMuscles.includes(query.muscle) || exercise.secondaryMuscles.includes(query.muscle)) &&
        (query.equipment === null ||
          (query.equipment === 'bodyweight' ? exercise.requires.length === 0 : exercise.requires.includes(query.equipment)))
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Muscles and equipment that at least one catalog exercise uses, labelled for a menu. */
export const MUSCLE_OPTIONS: readonly { readonly value: MuscleGroup; readonly label: string }[] = MUSCLE_GROUPS.filter((m) =>
  EXERCISE_LIBRARY.some((e) => e.primaryMuscles.includes(m) || e.secondaryMuscles.includes(m)),
).map((value) => ({ value, label: MUSCLE_LABELS[value] }));

export const EQUIPMENT_OPTIONS: readonly { readonly value: EquipmentFilter; readonly label: string }[] = [
  { value: 'bodyweight', label: 'Bodyweight' },
  ...WORKOUT_EQUIPMENT.filter((q) => EXERCISE_LIBRARY.some((e) => e.requires.includes(q))).map((value) => ({
    value,
    label: EQUIPMENT_LABELS[value],
  })),
];

/** The type chips: categories that at least one catalog exercise has. */
export const CATEGORY_OPTIONS: readonly ExerciseCategory[] = EXERCISE_CATEGORIES.filter((c) => EXERCISE_LIBRARY.some((e) => e.categories.includes(c)));
