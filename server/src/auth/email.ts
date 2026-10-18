import { resolve } from 'node:path';
import { ConfigError, Env, text } from '../env';
import type { Log } from '../extraction-handler';

/**
 * How account emails ("confirm your email address", "reset your password") are delivered. Configured
 * from the environment; without it, email/password accounts are switched off, because an address nobody
 * has confirmed must never become an account.
 *
 * - `resend`: Resend's HTTPS API (https://resend.com). Needs RESEND_API_KEY (a secret: Secret Manager)
 *   and EMAIL_FROM (a sender on a domain verified in Resend). A missing or malformed value stops the
 *   server at startup with the variable's name; it never falls back to another mode.
 * - `dev-outbox`: local development only (refused unless BETTER_AUTH_URL is localhost and NODE_ENV is
 *   not production). Each email is written as a text file to a git-ignored folder instead of being sent.
 *
 * A send never throws and never claims more than it knows: every method returns what happened (`ok`, the
 * provider's HTTP status, a short machine reason such as `invalid_api_key`) and the server logs the same,
 * at error severity on failure. Neither ever contains the address, the link, the token or the key.
 * The person is NOT told when a send fails: the API must answer the same for every address, so a failure
 * can't be shown to them. Failures are caught by monitoring `auth.email-failed` (server/AUTH.md).
 */
export type EmailConfig =
  | { readonly kind: 'resend'; readonly apiKey: string; readonly from: string }
  | { readonly kind: 'dev-outbox'; readonly directory: string };

export interface VerificationMessage {
  readonly to: string;
  /** The confirmation link (contains a signed, expiring token). */
  readonly url: string;
}

/** A password-reset message: the same shape, but the link opens the "choose a new password" page. */
export type PasswordResetMessage = VerificationMessage;

/** What happened to one send. `reason` is a short machine code (a provider error type or an error name), never text from a person. */
export interface DeliveryResult {
  readonly ok: boolean;
  /** The provider's HTTP status, when it answered. */
  readonly status?: number;
  readonly reason?: string;
}

export interface EmailSender {
  readonly kind: EmailConfig['kind'];
  /** Never throws: a failure is logged (without the address or the link) and the person can ask again by signing in. */
  sendVerification(message: VerificationMessage): Promise<DeliveryResult>;
  /** Never throws: a failure is logged (without the address or the link) and the person can request another link. */
  sendPasswordReset(message: PasswordResetMessage): Promise<DeliveryResult>;
  /** A clearly labelled test message with no link, for the email test command (tools/email-test.ts). */
  sendTest(to: string): Promise<DeliveryResult>;
}

interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export const DEFAULT_DEV_OUTBOX = 'server/.dev-outbox';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10_000;
const FROM_PATTERN = /^([^<>\r\n]+<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/;

export function loadEmailConfig(env: Env, { localOnly }: { localOnly: boolean }): EmailConfig | null {
  const kind = text(env, 'EMAIL_DELIVERY');
  if (kind === null) {
    return null;
  }
  if (kind === 'resend') {
    const apiKey = text(env, 'RESEND_API_KEY');
    const from = text(env, 'EMAIL_FROM');
    if (!apiKey || !from) {
      throw new ConfigError('EMAIL_DELIVERY=resend needs RESEND_API_KEY and EMAIL_FROM.');
    }
    if (!FROM_PATTERN.test(from)) {
      throw new ConfigError('EMAIL_FROM must be an address such as "StokeForm <no-reply@example.com>".');
    }
    return { kind, apiKey, from };
  }
  if (kind === 'dev-outbox') {
    if (!localOnly || env['NODE_ENV'] === 'production') {
      throw new ConfigError('EMAIL_DELIVERY=dev-outbox is for local development only (BETTER_AUTH_URL on localhost, NODE_ENV not production).');
    }
    return { kind, directory: resolve(text(env, 'EMAIL_DEV_OUTBOX_DIR') ?? DEFAULT_DEV_OUTBOX) };
  }
  throw new ConfigError('EMAIL_DELIVERY must be resend or dev-outbox.');
}

interface EmailCopy {
  readonly subject: string;
  readonly intro: string;
  /** Without a button there is no link (the test message). */
  readonly button?: string;
  readonly validity: string;
  readonly ignore: string;
}

/** The wording of each email. No user-supplied text (such as the account name) goes into any of them. */
const COPY = {
  verification: {
    subject: 'Confirm your email for StokeForm',
    intro: 'Confirm your email address to finish creating your StokeForm account:',
    button: 'Confirm email',
    validity: 'The link works for 24 hours. After confirming, go back to the app and sign in.',
    ignore: "If you didn't create a StokeForm account, ignore this email and don't open the link: nothing happens without it.",
  },
  'password-reset': {
    subject: 'Reset your StokeForm password',
    intro: 'Someone asked to reset the password of the StokeForm account for this email address. To choose a new password, open this link:',
    button: 'Choose a new password',
    validity: 'The link works once, for 1 hour. Afterwards, sign in to the app with the new password; you will be signed out of your other devices.',
    ignore: "If you didn't ask for this, ignore this email and don't open the link: your password stays exactly as it is.",
  },
  test: {
    subject: 'StokeForm email test',
    intro: 'This is a test message from your StokeForm server. If you can read it, email delivery works.',
    validity: 'There is nothing to open or confirm.',
    ignore: 'It was sent by the email test command; no account was created or changed.',
  },
} as const satisfies Record<string, EmailCopy>;

function render(copy: EmailCopy, url?: string): RenderedEmail {
  const text = [copy.intro, ...(url ? ['', url] : []), '', copy.validity, '', copy.ignore].join('\n');
  const button = url && copy.button
    ? `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#c6f36b;color:#111;font-weight:600;text-decoration:none">${escapeHtml(copy.button)}</a></p>\n`
    : '';
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a">
<p>${escapeHtml(copy.intro.replace(/:$/, '.'))}</p>
${button}<p>${escapeHtml(copy.validity)}</p>
<p style="color:#666">${escapeHtml(copy.ignore)}</p>
</body></html>`;
  return { subject: copy.subject, text, html };
}

export const verificationEmail = (url: string): RenderedEmail => render(COPY.verification, url);
export const passwordResetEmail = (url: string): RenderedEmail => render(COPY['password-reset'], url);
export const testEmail = (): RenderedEmail => render(COPY.test);

/** Resend names its error types in snake_case (`invalid_api_key`, `validation_error`...). Only a value of that shape is kept. */
const REASON_PATTERN = /^[a-z][a-z0-9_]{2,40}$/;
const MAX_ERROR_BODY_CHARS = 2000;

/** Writes one email to the dev outbox folder and returns the file name (server/tools/dev-outbox.ts). */
export type OutboxWriter = (directory: string, content: string) => Promise<string>;

export interface EmailSenderDeps {
  readonly fetch?: typeof fetch;
  /** Required for dev-outbox. Injected so the API server's own code never touches the file system. */
  readonly writeOutbox?: OutboxWriter;
}

export function createEmailSender(config: EmailConfig, log: Log, { fetch: fetchImpl = fetch, writeOutbox }: EmailSenderDeps = {}): EmailSender {
  /** Delivers one rendered message. Logs the outcome (a status or an error name), never the address or link. */
  let deliver: (to: string, message: RenderedEmail, type: string) => Promise<DeliveryResult>;
  if (config.kind === 'resend') {
    deliver = async (to, message, type) => {
      try {
        const response = await fetchImpl(RESEND_ENDPOINT, {
          method: 'POST',
          headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from: config.from, to: [to], subject: message.subject, text: message.text, html: message.html }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        if (response.ok) {
          // The answer holds only an id, but is not read: nothing from it is needed or kept.
          await response.body?.cancel().catch(() => undefined);
          log('auth.email-sent', { provider: 'resend', type, status: response.status });
          return { ok: true, status: response.status };
        }
        // A failure carries Resend's error type (for example `invalid_api_key` or `validation_error`): that
        // is kept. Its human message may quote the address or the sender, so it is not read into the log.
        const reason = await errorType(response);
        log('auth.email-failed', { provider: 'resend', type, status: response.status, ...(reason ? { reason } : {}) });
        return { ok: false, status: response.status, ...(reason ? { reason } : {}) };
      } catch (e) {
        const reason = e instanceof Error ? e.name : typeof e;
        log('auth.email-failed', { provider: 'resend', type, errorName: reason });
        return { ok: false, reason };
      }
    };
  } else {
    if (!writeOutbox) {
      throw new Error('The dev outbox needs a writer (server/tools/dev-outbox.ts).');
    }
    deliver = async (to, message, type) => {
      try {
        const file = await writeOutbox(config.directory, `To: ${to}\nSubject: ${message.subject}\n\n${message.text}\n`);
        log('auth.email-written-to-dev-outbox', { file, type });
        return { ok: true };
      } catch (e) {
        const reason = e instanceof Error ? e.name : typeof e;
        log('auth.email-failed', { provider: 'dev-outbox', type, errorName: reason });
        return { ok: false, reason };
      }
    };
  }
  return {
    kind: config.kind,
    sendVerification: ({ to, url }) => deliver(to, verificationEmail(url), 'verification'),
    sendPasswordReset: ({ to, url }) => deliver(to, passwordResetEmail(url), 'password-reset'),
    sendTest: (to) => deliver(to, testEmail(), 'test'),
  };
}

/** A plain-English reading of a failed send, from the provider's status and error type only (never any text a person wrote). */
export function deliveryHint({ status, reason }: DeliveryResult): string {
  if (reason === 'TimeoutError' || reason === 'AbortError') {
    return 'Resend did not answer in time. Check the network, then try again.';
  }
  if (status === undefined) {
    return 'Could not reach Resend. Check the network or proxy settings.';
  }
  if (status === 401 || reason === 'invalid_api_key' || reason === 'missing_api_key') {
    return 'Resend refused the API key: it is missing, mistyped, or revoked. Create a new key and update RESEND_API_KEY.';
  }
  if (reason === 'restricted_api_key') {
    return 'The API key is restricted. Create one with "Sending access" (or full access) for this domain.';
  }
  if (status === 403) {
    return "Resend refused the sender: the domain in EMAIL_FROM is not verified in Resend, or the key can't send from it. Until a domain is verified, Resend only lets onboarding@resend.dev send to your own Resend account address.";
  }
  if (status === 422 || status === 400 || reason === 'validation_error' || reason === 'invalid_from_address') {
    return 'Resend rejected the message: check that EMAIL_FROM is a valid, verified sender and the recipient address is valid.';
  }
  if (status === 429) {
    return 'Resend rate limit reached. Wait and try again.';
  }
  return status >= 500 ? 'Resend had a problem on its side. Try again in a few minutes.' : 'Resend refused the message. See the status and reason above.';
}

/** The `name` of a Resend error body, if it has the expected shape; otherwise nothing. Reads at most a few KB. */
async function errorType(response: Response): Promise<string | undefined> {
  try {
    const raw = (await response.text()).slice(0, MAX_ERROR_BODY_CHARS);
    const name = (JSON.parse(raw) as { name?: unknown }).name;
    return typeof name === 'string' && REASON_PATTERN.test(name) ? name : undefined;
  } catch {
    return undefined;
  }
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
