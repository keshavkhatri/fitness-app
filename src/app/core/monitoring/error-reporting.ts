import { ErrorHandler, Provider } from '@angular/core';
import * as Sentry from '@sentry/angular';

import { environment } from '../../../environments/environment';

/** Query strings can carry tokens or codes (sign-in callbacks): never sent. */
const withoutQuery = (url: string) => url.split(/[?#]/)[0];

/**
 * Crash and error reporting (Sentry). On only when the build has a DSN (environment.sentryDsn); off in development
 * and while it's null. Reports carry the error, its stack, the app version and the screen it happened on. They never
 * carry the person: no user, no IP, no cookies, no console output, no query strings, no request or response bodies,
 * and none of the person's data (health values live in storage, which is never attached).
 */
export function initErrorReporting(): boolean {
  const dsn = environment.sentryDsn ?? null;
  if (!dsn) {
    return false;
  }
  Sentry.init({
    dsn,
    environment: environment.production ? 'production' : 'development',
    release: environment.release ?? undefined,
    // Nothing about the person: no user fields, cookies, headers, bodies or query strings.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    // Errors only: no performance tracing, no session replay.
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
  return true;
}

/** An error report with nothing about the person (who, where from, what they sent). */
export function scrubEvent<T extends Sentry.ErrorEvent>(event: T): T {
  delete event.user;
  delete event.server_name;
  if (event.request) {
    event.request = { url: event.request.url ? withoutQuery(event.request.url) : undefined };
  }
  return event;
}

/** Trail steps before an error: no console output; addresses without their query strings. */
export function scrubBreadcrumb(crumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (crumb.category === 'console') {
    return null;
  }
  if (crumb.data && typeof crumb.data['url'] === 'string') {
    crumb.data = { ...crumb.data, url: withoutQuery(crumb.data['url']) };
  }
  if (crumb.category === 'navigation' && crumb.data) {
    crumb.data = {
      from: typeof crumb.data['from'] === 'string' ? withoutQuery(crumb.data['from']) : undefined,
      to: typeof crumb.data['to'] === 'string' ? withoutQuery(crumb.data['to']) : undefined,
    };
  }
  return crumb;
}

/** Angular's error handler sends uncaught errors to Sentry (when reporting is on). */
export function provideErrorReporting(): Provider[] {
  return environment.sentryDsn ? [{ provide: ErrorHandler, useValue: Sentry.createErrorHandler({ showDialog: false }) }] : [];
}
