import type { Breadcrumb, ErrorEvent } from '@sentry/angular';

import { initErrorReporting, provideErrorReporting, scrubBreadcrumb, scrubEvent } from './error-reporting';

describe('error reporting', () => {
  it('is off without a DSN (development builds)', () => {
    expect(initErrorReporting()).toBe(false);
    expect(provideErrorReporting()).toEqual([]);
  });

  it('removes the person from a report: user, server name, request details and query strings', () => {
    const event = {
      type: undefined,
      user: { id: 'u1', email: 'me@example.test', ip_address: '1.2.3.4' },
      server_name: 'phone',
      request: { url: 'https://localhost/auth/callback?code=secret#x', headers: { authorization: 'Bearer t' }, cookies: { a: 'b' }, data: '{"weight":94.5}' },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.user).toBeUndefined();
    expect(out.server_name).toBeUndefined();
    expect(out.request).toEqual({ url: 'https://localhost/auth/callback' });
  });

  it('drops console output and strips query strings from the trail', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'weight 94.5' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'fetch', data: { url: 'https://api/v1/x?token=t', method: 'POST' } })?.data).toEqual({ url: 'https://api/v1/x', method: 'POST' });
    expect(scrubBreadcrumb({ category: 'navigation', data: { from: '/a?x=1', to: '/b?code=2' } } as Breadcrumb)?.data).toEqual({ from: '/a', to: '/b' });
  });
});
