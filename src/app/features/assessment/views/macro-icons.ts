import { MacroRowViewModel } from '../assessment-view-model';

/** Generic food-group symbols for each macro (decorative; every macro is also named). */
export const MACRO_ICONS: Readonly<Record<MacroRowViewModel['key'], string>> = {
  protein: 'fish-outline',
  carbohydrate: 'leaf-outline',
  fat: 'water-outline',
};
