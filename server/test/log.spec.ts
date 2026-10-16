import { describe, expect, it } from 'vitest';
import { severityOf } from '../src/log';

describe('log severity (what Cloud Run reads)', () => {
  it('shows failures as ERROR so an alert can watch them, warnings as WARNING, the rest as INFO', () => {
    for (const event of ['auth.email-failed', 'auth.google-start-failed', 'auth.error', 'auth.session-check-failed']) {
      expect(severityOf(event), event).toBe('ERROR');
    }
    for (const event of ['auth.warn', 'server.warn']) {
      expect(severityOf(event), event).toBe('WARNING');
    }
    for (const event of ['auth.email-sent', 'auth.email-written-to-dev-outbox', 'auth.password-reset', 'server.listening', 'auth.cleanup']) {
      expect(severityOf(event), event).toBe('INFO');
    }
  });
});
