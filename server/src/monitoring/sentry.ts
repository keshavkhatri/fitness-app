import { randomUUID } from 'node:crypto';

/**
 * Error reporting to Sentry, without an SDK (the server is one small bundle): the events the server already logs at
 * ERROR severity are also sent to Sentry's envelope endpoint. Those log events carry codes, counts and durations
 * only (see extraction-handler.ts): never a person, an address, a token or a health value; that holds here too.
 * Sending never throws, never delays a request, and is capped per minute.
 */
export interface ErrorReporter {
  report(event: string, fields: Readonly<Record<string, unknown>>): void;
}

export interface SentryDsn {
  readonly endpoint: string;
  readonly publicKey: string;
}

/** `https://<key>@<host>/<project>` → the envelope endpoint and key; null when it isn't a DSN. */
export function parseDsn(dsn: string): SentryDsn | null {
  try {
    const url = new URL(dsn);
    const project = url.pathname.replace(/^\/+|\/+$/g, '');
    if (url.protocol !== 'https:' || !url.username || !/^\d+$/.test(project)) {
      return null;
    }
    return { endpoint: `https://${url.host}/api/${project}/envelope/`, publicKey: url.username };
  } catch {
    return null;
  }
}

const PER_MINUTE = 30;

export function createSentryReporter({
  dsn,
  environment,
  release,
  fetch: http = (input, init) => fetch(input, init),
  now = () => Date.now(),
}: {
  dsn: SentryDsn;
  environment: string;
  release: string | null;
  fetch?: typeof fetch;
  now?: () => number;
}): ErrorReporter {
  let windowStart = 0;
  let sent = 0;
  return {
    report(event, fields) {
      const t = now();
      if (t - windowStart >= 60_000) {
        windowStart = t;
        sent = 0;
      }
      if (sent >= PER_MINUTE) {
        return;
      }
      sent++;
      const eventId = randomUUID().replace(/-/g, '');
      // Only plain values from the log fields (they hold codes and numbers by design).
      const extra = Object.fromEntries(Object.entries(fields).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)));
      const body = [
        JSON.stringify({ event_id: eventId, sent_at: new Date(t).toISOString() }),
        JSON.stringify({ type: 'event' }),
        JSON.stringify({
          event_id: eventId,
          timestamp: t / 1000,
          platform: 'node',
          level: 'error',
          logger: 'stokeform-server',
          environment,
          ...(release ? { release } : {}),
          message: { formatted: event },
          fingerprint: [event, String(extra['errorName'] ?? extra['code'] ?? extra['reason'] ?? '')],
          tags: { event },
          extra,
        }),
      ].join('\n');
      void http(dsn.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-sentry-envelope',
          'x-sentry-auth': `Sentry sentry_version=7, sentry_client=stokeform-server/1.0, sentry_key=${dsn.publicKey}`,
        },
        body,
        signal: AbortSignal.timeout(5_000),
      }).catch(() => undefined);
    },
  };
}
