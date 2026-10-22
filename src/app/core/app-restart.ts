import { InjectionToken } from '@angular/core';

/** Starts the app afresh (every service's in-memory copy of the data goes): after erasing or restoring data. */
export const RESTART_APP = new InjectionToken<() => void>('RESTART_APP', {
  providedIn: 'root',
  factory: () => () => window.location.replace('/'),
});
