import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import { createSentryReporter, parseDsn } from '../src/monitoring/sentry';

const DSN = 'https://abc123@o42.ingest.sentry.io/4507';

describe('Sentry reporting', () => {
  it('reads a DSN, and refuses anything else', () => {
    expect(parseDsn(DSN)).toEqual({ endpoint: 'https://o42.ingest.sentry.io/api/4507/envelope/', publicKey: 'abc123' });
    expect(parseDsn('http://abc@host/1')).toBeNull();
    expect(parseDsn('https://host/1')).toBeNull();
    expect(parseDsn('nonsense')).toBeNull();
    expect(loadConfig({}).sentry).toBeNull();
    expect(loadConfig({ SENTRY_DSN: DSN, K_REVISION: 'svc-00035' }).sentry).toEqual({ dsn: parseDsn(DSN), release: 'svc-00035' });
    expect(() => loadConfig({ SENTRY_DSN: 'nope' })).toThrow();
  });

  it('sends an envelope with the event name and plain log fields only', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const reporter = createSentryReporter({ dsn: parseDsn(DSN)!, environment: 'production', release: 'r1', fetch: fetch as never, now: () => 1_700_000_000_000 });
    reporter.report('auth.email-failed', { reason: 'provider', status: 500, nested: { email: 'me@example.test' } });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://o42.ingest.sentry.io/api/4507/envelope/');
    expect((init.headers as Record<string, string>)['x-sentry-auth']).toContain('sentry_key=abc123');
    const [, item, event] = String(init.body).split('\n').map((line) => JSON.parse(line));
    expect(item).toEqual({ type: 'event' });
    expect(event).toMatchObject({ level: 'error', environment: 'production', release: 'r1', message: { formatted: 'auth.email-failed' }, extra: { reason: 'provider', status: 500 } });
    expect(JSON.stringify(event)).not.toContain('me@example.test');
  });

  it('never sends more than 30 a minute, and a failed send is ignored', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('offline');
    });
    let t = 0;
    const reporter = createSentryReporter({ dsn: parseDsn(DSN)!, environment: 'production', release: null, fetch: fetch as never, now: () => t });
    for (let i = 0; i < 40; i++) {
      reporter.report('x.error', {});
    }
    expect(fetch).toHaveBeenCalledTimes(30);
    t = 61_000;
    reporter.report('x.error', {});
    expect(fetch).toHaveBeenCalledTimes(31);
  });
});
