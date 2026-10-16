import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAuthConfig } from '../src/auth/auth-config';
import { createEmailSender, deliveryHint, loadEmailConfig, passwordResetEmail, testEmail, verificationEmail } from '../src/auth/email';
import { ConfigError } from '../src/config';
import { LogFields } from '../src/extraction-handler';
import { writeDevOutboxEmail } from '../tools/dev-outbox';

const KEY = 're_placeholder_key_for_tests_only';
const LINK = 'http://localhost:8787/api/auth/verify-email?token=placeholder.token.value&callbackURL=x';
const message = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return (e as Error).message;
  }
  throw new Error('expected a ConfigError');
};

describe('email delivery configuration', () => {
  it('is off when EMAIL_DELIVERY is unset (email/password accounts are then off too)', () => {
    expect(loadEmailConfig({}, { localOnly: false })).toBeNull();
  });

  it('Resend needs a key and a sender address, and never echoes the key', () => {
    expect(loadEmailConfig({ EMAIL_DELIVERY: 'resend', RESEND_API_KEY: KEY, EMAIL_FROM: 'Pulseform <no-reply@example.com>' }, { localOnly: false })).toEqual({
      kind: 'resend',
      apiKey: KEY,
      from: 'Pulseform <no-reply@example.com>',
    });
    expect(message(() => loadEmailConfig({ EMAIL_DELIVERY: 'resend', EMAIL_FROM: 'a@example.com' }, { localOnly: false }))).toMatch(/RESEND_API_KEY/);
    const bad = message(() => loadEmailConfig({ EMAIL_DELIVERY: 'resend', RESEND_API_KEY: KEY, EMAIL_FROM: 'not an address' }, { localOnly: false }));
    expect(bad).toMatch(/EMAIL_FROM/);
    expect(bad).not.toContain(KEY);
  });

  it('the dev outbox is refused anywhere but a local, non-production server', () => {
    expect(loadEmailConfig({ EMAIL_DELIVERY: 'dev-outbox' }, { localOnly: true })?.kind).toBe('dev-outbox');
    expect(message(() => loadEmailConfig({ EMAIL_DELIVERY: 'dev-outbox' }, { localOnly: false }))).toMatch(/local development only/);
    expect(message(() => loadEmailConfig({ EMAIL_DELIVERY: 'dev-outbox', NODE_ENV: 'production' }, { localOnly: true }))).toMatch(/local development only/);
    // Through the auth settings: an https (deployed) BETTER_AUTH_URL can't use it.
    const env = { BETTER_AUTH_SECRET: 'placeholder-secret-for-tests-only-0123456789', EMAIL_DELIVERY: 'dev-outbox' };
    expect(loadAuthConfig({ ...env, BETTER_AUTH_URL: 'http://localhost:8787' })?.email?.kind).toBe('dev-outbox');
    expect(message(() => loadAuthConfig({ ...env, BETTER_AUTH_URL: 'https://api.example.com' }))).toMatch(/local development only/);
  });

  it('refuses an unknown provider', () => {
    expect(message(() => loadEmailConfig({ EMAIL_DELIVERY: 'carrier-pigeon' }, { localOnly: true }))).toMatch(/resend or dev-outbox/);
  });
});

describe('the confirmation email', () => {
  it('carries the link, an expiry, and a warning for people who did not sign up; the link is HTML-escaped', () => {
    const mail = verificationEmail(LINK);
    expect(mail.text).toContain(LINK);
    expect(mail.text).toMatch(/24 hours/);
    expect(mail.text).toMatch(/didn't create a Pulseform account/);
    expect(mail.html).toContain(LINK.replace(/&/g, '&amp;'));
    expect(verificationEmail('https://x.test/?a="><script>').html).not.toContain('"><script>');
  });

  it('the reset email says it works once for an hour, that other devices are signed out, and what to do if unrequested', () => {
    const mail = passwordResetEmail(LINK);
    expect(mail.subject).toBe('Reset your Pulseform password');
    expect(mail.text).toContain(LINK);
    expect(mail.text).toMatch(/once, for 1 hour/);
    expect(mail.text).toMatch(/signed out of your other devices/);
    expect(mail.text).toMatch(/didn't ask for this/);
    expect(mail.text).toMatch(/password stays exactly as it is/);
    expect(mail.html).toContain(LINK.replace(/&/g, '&amp;'));
    expect(passwordResetEmail('https://x.test/?a="><script>').html).not.toContain('"><script>');
  });
});

describe('senders', () => {
  it('Resend: posts the message with the key in the header only; logs the status, never the address or link', async () => {
    const logs: { event: string; fields?: LogFields }[] = [];
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return new Response('{"id":"x","to":"alex@example.test"}', { status: 200 });
    }) as typeof fetch;
    const sender = createEmailSender({ kind: 'resend', apiKey: KEY, from: 'Pulseform <no-reply@example.com>' }, (event, fields) => logs.push({ event, fields }), { fetch: fakeFetch });
    await sender.sendVerification({ to: 'alex@example.test', url: LINK });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    expect((calls[0].init.headers as Record<string, string>)['authorization']).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(calls[0].init.body)) as { to: string[]; text: string };
    expect(body.to).toEqual(['alex@example.test']);
    expect(body.text).toContain(LINK);
    expect(String(calls[0].init.body)).not.toContain(KEY);
    expect(logs).toEqual([{ event: 'auth.email-sent', fields: { provider: 'resend', type: 'verification', status: 200 } }]);
  });

  it('Resend: a password-reset email goes the same way, with its own subject and wording', async () => {
    const calls: { init: RequestInit }[] = [];
    const logs: { event: string; fields?: LogFields }[] = [];
    const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ init: init! });
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const sender = createEmailSender({ kind: 'resend', apiKey: KEY, from: 'a@example.com' }, (event, fields) => logs.push({ event, fields }), { fetch: fakeFetch });
    const resetLink = 'http://localhost:8787/v1/auth/reset-password?token=placeholder0token0value0';
    await sender.sendPasswordReset({ to: 'alex@example.test', url: resetLink });
    const body = JSON.parse(String(calls[0].init.body)) as { subject: string; text: string; html: string; to: string[] };
    expect(body.to).toEqual(['alex@example.test']);
    expect(body.subject).toBe('Reset your Pulseform password');
    expect(body.text).toContain(resetLink);
    expect(body.html).toContain(resetLink);
    expect(String(calls[0].init.body)).not.toContain(KEY);
    expect(logs).toEqual([{ event: 'auth.email-sent', fields: { provider: 'resend', type: 'password-reset', status: 200 } }]);
  });

  it('Resend: a failed reset email is logged without the address or the link and does not throw', async () => {
    const logs: { event: string; fields?: LogFields }[] = [];
    const down = (async () => {
      throw new TypeError('connect failed alex@example.test');
    }) as typeof fetch;
    const sender = createEmailSender({ kind: 'resend', apiKey: KEY, from: 'a@example.com' }, (event, fields) => logs.push({ event, fields }), { fetch: down });
    await expect(sender.sendPasswordReset({ to: 'alex@example.test', url: LINK })).resolves.toEqual({ ok: false, reason: 'TypeError' });
    expect(JSON.stringify(logs)).not.toMatch(/alex@example\.test|placeholder\.token/);
    expect(logs).toEqual([{ event: 'auth.email-failed', fields: { provider: 'resend', type: 'password-reset', errorName: 'TypeError' } }]);
  });

  it('Resend: a failure is logged without detail and does not throw', async () => {
    const logs: { event: string; fields?: LogFields }[] = [];
    const down = (async () => {
      throw new TypeError('connect failed alex@example.test');
    }) as typeof fetch;
    const sender = createEmailSender({ kind: 'resend', apiKey: KEY, from: 'a@example.com' }, (event, fields) => logs.push({ event, fields }), { fetch: down });
    await expect(sender.sendVerification({ to: 'alex@example.test', url: LINK })).resolves.toEqual({ ok: false, reason: 'TypeError' });
    expect(logs).toEqual([{ event: 'auth.email-failed', fields: { provider: 'resend', type: 'verification', errorName: 'TypeError' } }]);
  });

  it('dev outbox: writes the email to a local file instead of sending it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseform-outbox-'));
    try {
      const logs: string[] = [];
      const sender = createEmailSender({ kind: 'dev-outbox', directory }, (event, fields) => logs.push(event + JSON.stringify(fields)), { writeOutbox: writeDevOutboxEmail });
      await sender.sendVerification({ to: 'alex@example.test', url: LINK });
      await sender.sendPasswordReset({ to: 'alex@example.test', url: LINK.replace('verify-email', 'reset-password') });
      const files = (await readdir(directory)).sort();
      expect(files).toHaveLength(2);
      const contents = await Promise.all(files.map((f) => readFile(join(directory, f), 'utf8')));
      for (const content of contents) {
        expect(content).toContain('To: alex@example.test');
      }
      expect(contents.some((c) => c.includes('Subject: Confirm your email') && c.includes(LINK))).toBe(true);
      expect(contents.some((c) => c.includes('Subject: Reset your Pulseform password') && c.includes('reset-password'))).toBe(true);
      expect(logs.join()).not.toMatch(/alex@example\.test|placeholder\.token/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('diagnosing a failed send without exposing anything', () => {
  const resendAnswers = (status: number, body: string) => (async () => new Response(body, { status })) as typeof fetch;
  const senderWith = (fetchImpl: typeof fetch, logs: { event: string; fields?: LogFields }[]) =>
    createEmailSender({ kind: 'resend', apiKey: KEY, from: 'a@example.com' }, (event, fields) => logs.push({ event, fields }), { fetch: fetchImpl });

  it('keeps only the provider status and its error TYPE; the message (which may quote the address or sender) is never read into the log', async () => {
    const logs: { event: string; fields?: LogFields }[] = [];
    const sender = senderWith(resendAnswers(401, JSON.stringify({ name: 'invalid_api_key', message: `API key for alex@example.test is invalid`, statusCode: 401 })), logs);
    const result = await sender.sendVerification({ to: 'alex@example.test', url: LINK });
    expect(result).toEqual({ ok: false, status: 401, reason: 'invalid_api_key' });
    expect(logs).toEqual([{ event: 'auth.email-failed', fields: { provider: 'resend', type: 'verification', status: 401, reason: 'invalid_api_key' } }]);
    expect(JSON.stringify(logs)).not.toMatch(/alex@example\.test|placeholder\.token|re_placeholder/);
  });

  it('drops an error type that is not a plain snake_case name, and survives a body that is not JSON', async () => {
    for (const body of [JSON.stringify({ name: 'Bad Name With alex@example.test' }), JSON.stringify({ name: 123 }), 'not json at all', '', 'x'.repeat(10_000)]) {
      const logs: { event: string; fields?: LogFields }[] = [];
      const result = await senderWith(resendAnswers(422, body), logs).sendPasswordReset({ to: 'alex@example.test', url: LINK });
      expect(result).toEqual({ ok: false, status: 422 });
      expect(logs).toEqual([{ event: 'auth.email-failed', fields: { provider: 'resend', type: 'password-reset', status: 422 } }]);
    }
  });

  it('a success reports ok with the status and is logged as sent', async () => {
    const logs: { event: string; fields?: LogFields }[] = [];
    const result = await senderWith(resendAnswers(200, '{"id":"abc"}'), logs).sendTest('alex@example.test');
    expect(result).toEqual({ ok: true, status: 200 });
    expect(logs).toEqual([{ event: 'auth.email-sent', fields: { provider: 'resend', type: 'test', status: 200 } }]);
  });

  it('a timeout or network error never claims success', async () => {
    const aborted = (async () => {
      throw new DOMException('timed out', 'TimeoutError');
    }) as typeof fetch;
    const result = await senderWith(aborted, []).sendVerification({ to: 'alex@example.test', url: LINK });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('TimeoutError');
  });

  it('the test message has no link and says so', () => {
    const mail = testEmail();
    expect(mail.subject).toBe('Pulseform email test');
    expect(mail.text).not.toMatch(/https?:\/\//);
    expect(mail.html).not.toContain('<a ');
    expect(mail.text).toMatch(/nothing to open or confirm/i);
  });

  it.each([
    [{ ok: false, status: 401, reason: 'invalid_api_key' }, /API key/],
    [{ ok: false, status: 403, reason: 'validation_error' }, /domain in EMAIL_FROM is not verified/],
    [{ ok: false, status: 422 }, /EMAIL_FROM is a valid, verified sender/],
    [{ ok: false, status: 429 }, /rate limit/],
    [{ ok: false, status: 503 }, /problem on its side/],
    [{ ok: false, reason: 'TimeoutError' }, /did not answer in time/],
    [{ ok: false, reason: 'TypeError' }, /Could not reach Resend/],
  ])('explains a failure in plain words (%#)', (result, expected) => {
    expect(deliveryHint(result)).toMatch(expected);
    expect(deliveryHint(result)).not.toMatch(/re_|@example/);
  });
});
