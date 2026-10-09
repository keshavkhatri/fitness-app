export const MEASUREMENT_HISTORY_PATH = '/you/measurements';
/** Where the entry page returns to. */
export const MEASUREMENT_RETURN_PATH = MEASUREMENT_HISTORY_PATH;
export const NEW_MEASUREMENT_PATH = ['/you', 'measurements', 'new'];
export const measurementEntryPath = (entryId: string) => ['/you', 'measurements', entryId];
