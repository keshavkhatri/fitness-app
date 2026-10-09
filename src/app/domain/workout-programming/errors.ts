/**
 * Structured domain errors. Machine-readable `code`, developer-facing
 * `message`, optional `details` for context. Never UI copy.
 */
export type WorkoutGenerationErrorCode =
  | 'invalid-frequency'
  | 'unsupported-goal'
  | 'invalid-experience'
  | 'missing-location'
  | 'invalid-location'
  | 'missing-equipment'
  | 'invalid-equipment'
  | 'invalid-generated-date'
  | 'no-compatible-exercises'
  | 'impossible-session-requirements'
  | 'invalid-configuration';

export interface WorkoutGenerationError {
  readonly code: WorkoutGenerationErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, string | number | readonly string[]>>;
}

export type WorkoutResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: WorkoutGenerationError };

export const ok = <T>(value: T): WorkoutResult<T> => ({ ok: true, value });

export const fail = <T = never>(
  code: WorkoutGenerationErrorCode,
  message: string,
  details?: WorkoutGenerationError['details'],
): WorkoutResult<T> => ({ ok: false, error: details ? { code, message, details } : { code, message } });
