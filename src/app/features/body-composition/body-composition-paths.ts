export const BODY_COMPOSITION_HISTORY_PATH = '/you/body-composition';
/** Where the entry page returns to. */
export const BODY_COMPOSITION_RETURN_PATH = BODY_COMPOSITION_HISTORY_PATH;
export const NEW_BODY_COMPOSITION_PATH = ['/you', 'body-composition', 'new'];
export const bodyCompositionDetailPath = (assessmentId: string) => ['/you', 'body-composition', assessmentId];
export const editBodyCompositionPath = (assessmentId: string) => ['/you', 'body-composition', assessmentId, 'edit'];
