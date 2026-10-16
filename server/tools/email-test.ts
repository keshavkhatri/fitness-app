import { maskEmail } from '../src/auth/cleanup';
import { createEmailSender, deliveryHint, loadEmailConfig } from '../src/auth/email';
import { ConfigError, text } from '../src/env';
import { writeDevOutboxEmail } from './dev-outbox';

/**
 * The email test command:  node email-test.mjs --to <address> [--kind test|verification|password-reset]
 *
 * Sends ONE message through the configured delivery (EMAIL_DELIVERY=resend, or the local dev outbox) to the
 * address you name, so you can check sender, domain and key before enabling accounts. There is no default
 * recipient and no list: nothing is sent without an explicit `--to`.
 *
 *  - `test` (default): a clearly labelled message with no link.
 *  - `verification` / `password-reset`: the real template, with the link shaped like a real one but carrying
 *    a fake token, so opening it shows the server's "link not valid" page (it proves the link points at
 *    BETTER_AUTH_URL; it cannot confirm or change anything).
 *
 * Needs the same variables as the server (EMAIL_DELIVERY, RESEND_API_KEY, EMAIL_FROM; BETTER_AUTH_URL for the
 * link kinds). It does NOT need the database or BETTER_AUTH_SECRET. Prints a masked address, the provider's
 * HTTP status and a short reason code: never the key, the link or the address. Exit codes: 0 sent, 1 failed,
 * 2 bad usage.
 */
const KINDS = ['test', 'verification', 'password-reset'] as const;
type Kind = (typeof KINDS)[number];
const ADDRESS = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function parse(argv: readonly string[]): { to: string; kind: Kind } | null {
  let to = '';
  let kind: Kind = 'test';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--to') {
      to = argv[++i] ?? '';
    } else if (argv[i] === '--kind') {
      const value = argv[++i] as Kind;
      if (!KINDS.includes(value)) {
        return null;
      }
      kind = value;
    } else {
      return null;
    }
  }
  return ADDRESS.test(to) ? { to, kind } : null;
}

async function main(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  const options = parse(argv);
  if (!options) {
    console.error('Usage: email-test --to <address> [--kind test|verification|password-reset]   (nothing is sent without --to)');
    return 2;
  }
  const rawBase = text(env, 'BETTER_AUTH_URL');
  let base: URL | null = null;
  if (rawBase) {
    try {
      base = new URL(rawBase);
    } catch {
      throw new ConfigError('BETTER_AUTH_URL must be a URL such as https://api.example.com.');
    }
  }
  if (options.kind !== 'test' && !base) {
    throw new ConfigError('--kind verification and password-reset build a link from BETTER_AUTH_URL: set it to the public service URL.');
  }
  const config = loadEmailConfig(env, { localOnly: base !== null && base.protocol === 'http:' && LOOPBACK.has(base.hostname) });
  if (!config) {
    console.error('Email delivery is not configured (EMAIL_DELIVERY is unset): email/password accounts are off. Nothing was sent.');
    return 1;
  }
  const events: string[] = [];
  const sender = createEmailSender(config, (event, fields) => events.push(`${event} ${JSON.stringify(fields ?? {})}`), { writeOutbox: writeDevOutboxEmail });
  const origin = base?.origin ?? '';
  const result =
    options.kind === 'verification'
      ? await sender.sendVerification({ to: options.to, url: `${origin}/api/auth/verify-email?token=test-token-not-real&callbackURL=${encodeURIComponent(`${origin}/v1/auth/email-verified`)}` })
      : options.kind === 'password-reset'
        ? await sender.sendPasswordReset({ to: options.to, url: `${origin}/v1/auth/reset-password?token=test-token-not-real` })
        : await sender.sendTest(options.to);

  console.log(`delivery: ${config.kind} | message: ${options.kind} | to: ${maskEmail(options.to)}`);
  if (result.ok) {
    console.log(
      config.kind === 'resend'
        ? `Accepted by Resend (HTTP ${result.status}). Accepted is not delivered: check the inbox and the spam folder, and the Resend dashboard's Emails log.`
        : 'Written to the dev outbox folder (nothing was sent).',
    );
    return 0;
  }
  console.error(`FAILED${result.status ? ` (HTTP ${result.status})` : ''}${result.reason ? ` reason: ${result.reason}` : ''}`);
  console.error(deliveryHint(result));
  return 1;
}

main(process.argv.slice(2), process.env).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof ConfigError ? error.message : 'Email test failed unexpectedly.');
    process.exit(1);
  },
);
