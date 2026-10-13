/**
 * "08:24" under an hour, "1:02:15" from an hour. Whole seconds elapsed since
 * `startedAt` (an ISO instant), measured against `now`; never negative, and
 * "00:00" when the start isn't a valid instant.
 */
export function formatElapsed(startedAt: string, now: Date): string {
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) {
    return '00:00';
  }
  const total = Math.max(0, Math.floor((now.getTime() - started) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}

/** "8 minutes 24 seconds" / "1 hour 2 minutes", for the accessible name of the workout time. */
export function spokenElapsed(startedAt: string, now: Date): string {
  const started = Date.parse(startedAt);
  const total = Number.isFinite(started) ? Math.max(0, Math.floor((now.getTime() - started) / 1000)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  return hours > 0 ? `${part(hours, 'hour')} ${part(minutes, 'minute')}` : `${part(minutes, 'minute')} ${part(seconds, 'second')}`;
}
