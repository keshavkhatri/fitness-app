export type QuickAddActionId =
  | 'start-workout'
  | 'add-food'
  | 'log-weight'
  | 'add-measurement'
  | 'upload-inbody'
  | 'add-progress-photo';

export interface QuickAddAction {
  id: QuickAddActionId;
  label: string;
  icon: string;
  /** Flip to true as each feature ships; unavailable actions render as "Coming soon". */
  available: boolean;
}

/**
 * Ordered list of Quick Add entries, passed to the sheet by the tabs shell.
 *
 * When a feature ships: set `available: true` and bind the sheet's
 * `(actionSelected)` in `TabsPage` to handle its id (typically by navigating
 * to that feature's route). The sheet itself never changes.
 */
export const QUICK_ADD_ACTIONS: readonly QuickAddAction[] = [
  { id: 'start-workout', label: 'Start workout', icon: 'barbell-outline', available: false },
  { id: 'add-food', label: 'Add food', icon: 'restaurant-outline', available: true },
  { id: 'log-weight', label: 'Log weight', icon: 'scale-outline', available: true },
  { id: 'add-measurement', label: 'Add measurement', icon: 'resize-outline', available: true },
  { id: 'upload-inbody', label: 'Upload InBody', icon: 'document-text-outline', available: false },
  { id: 'add-progress-photo', label: 'Progress photo', icon: 'camera-outline', available: false },
];
