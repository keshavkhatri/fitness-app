import { betterAuth } from 'better-auth';
import { bearer, oneTimeToken } from 'better-auth/plugins';
import { PostgresDialect } from 'kysely';
import type { Pool } from 'pg';
import type { Log } from '../extraction-handler';
import { AuthConfig } from './auth-config';
import { EmailSender } from './email';

/** Where Better Auth's own routes live (sign-up, sign-in, sign-out, Google callback). */
export const AUTH_BASE_PATH = '/api/auth';
/** The database schema reserved for Better Auth's tables (migration 0006). */
export const AUTH_SCHEMA = 'auth';
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
/** Minutes a one-time code from the Google flow stays valid. */
export const ONE_TIME_TOKEN_MINUTES = 3;
/** How long a "confirm your email" link works. */
export const EMAIL_VERIFICATION_HOURS = 24;
/** The page a confirmation link lands on (served by auth-routes): it tells the person to return to the app. */
export const EMAIL_VERIFIED_PATH = '/v1/auth/email-verified';
/** The page a password-reset link opens (served by auth-routes): choose a new password, in the browser. */
export const RESET_PASSWORD_PATH = '/v1/auth/reset-password';
/** How long a password-reset link works. It can be used once. */
export const PASSWORD_RESET_MINUTES = 60;

export interface CreateAuthOptions {
  readonly config: AuthConfig;
  /**
   * The server's pg pool (database.ts): Better Auth shares it, so its lifecycle is the server's
   * (created lazily, closed on shutdown). Queries name the `auth` schema explicitly.
   */
  readonly pool: Pick<Pool, 'connect' | 'end'>;
  /** The app origins (ALLOWED_ORIGINS); Better Auth refuses state-changing requests from others. */
  readonly trustedOrigins: readonly string[];
  /** The proxy header with the client IP (CLIENT_IP_HEADER), for Better Auth's rate limits. */
  readonly clientIpHeader: string | null;
  /** Sends "confirm your email" messages; null switches email/password accounts off. */
  readonly email: EmailSender | null;
  readonly log: Log;
  /** Tests switch the built-in rate limiter off; production keeps it on. */
  readonly rateLimit?: boolean;
}

/**
 * The Better Auth instance.
 *
 * Sessions: the app sends `Authorization: Bearer <token>` (the bearer plugin), because the app's
 * WebView origin (https://localhost, capacitor://localhost) is a different site from the API, and
 * WebViews block third-party cookies. Tokens must carry the server's signature
 * (`requireSignature`), so a session id read from the database is not enough to use a session.
 * Cookies are used only inside the system browser during Google sign-in.
 *
 * Verified identities only: an email/password account gets no session until its address is
 * confirmed through the emailed link, and a Google identity only when Google itself reports the
 * address as verified (read server-side from the ID token Google returns to this server).
 * A Google identity is attached to an existing account with the same address only when both sides
 * are verified; a matching address alone never grants access (see server/AUTH.md).
 */
export function createAuth({ config, pool, trustedOrigins, clientIpHeader, email, log, rateLimit = true }: CreateAuthOptions) {
  // Built here, not from the client's callbackURL: the link always lands on this server's own page.
  const verificationUrl = (token: string) =>
    `${config.baseUrl}${AUTH_BASE_PATH}/verify-email?${new URLSearchParams({ token, callbackURL: `${config.baseUrl}${EMAIL_VERIFIED_PATH}` }).toString()}`;
  return betterAuth({
    appName: 'Pulseform',
    secret: config.secret,
    baseURL: config.baseUrl,
    basePath: AUTH_BASE_PATH,
    database: { dialect: new PostgresDialect({ pool: pool as Pool }), type: 'postgres', schemaName: AUTH_SCHEMA },
    trustedOrigins: [...trustedOrigins],
    emailAndPassword: {
      enabled: email !== null,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      // Sign-up creates the account but no session; signing in works once the address is confirmed.
      // (Sign-up of an address that already has an account answers the same way, so it reveals nothing.)
      requireEmailVerification: true,
      autoSignIn: false,
      // Password reset: the link carries Better Auth's single-use token (consumed in the same transaction
      // that changes the password) and expires after an hour. Choosing a new password ends every session
      // of the account, so whoever had the old password, or a stolen session, is signed out. Asking for a
      // link always answers the same way, whether or not the address has an account.
      resetPasswordTokenExpiresIn: PASSWORD_RESET_MINUTES * 60,
      revokeSessionsOnPasswordReset: true,
      // Without email delivery there is nothing to send a link with: the reset endpoints stay disabled.
      ...(email
        ? {
            sendResetPassword: async ({ user, token }: { user: { email: string }; token: string }) => {
              // Not awaited: the answer is equally fast with or without an account behind the address.
              // The link is built here, to our own page: the client's `redirectTo` is never used.
              void email.sendPasswordReset({ to: user.email, url: `${config.baseUrl}${RESET_PASSWORD_PATH}?${new URLSearchParams({ token }).toString()}` });
            },
          }
        : {}),
      onPasswordReset: async () => {
        log('auth.password-reset');
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // Signing in (with the right password) while unconfirmed sends a fresh link.
      sendOnSignIn: true,
      // Confirming happens in a browser; the app signs in itself afterwards, so no browser session is made.
      autoSignInAfterVerification: false,
      expiresIn: EMAIL_VERIFICATION_HOURS * 60 * 60,
      sendVerificationEmail: async ({ user, token }) => {
        // Not awaited: sign-up answers equally fast whether or not the address already had an account.
        void email?.sendVerification({ to: user.email, url: verificationUrl(token) });
      },
    },
    account: {
      // Spelled out (these match Better Auth 1.7's defaults) and pinned by tests in auth.spec.ts.
      accountLinking: {
        enabled: true,
        // No provider is trusted blindly: Google must report the address as verified.
        trustedProviders: [],
        // ...and the existing account's own address must be confirmed: an unconfirmed password
        // account registered with someone else's address can never be joined to their Google identity.
        requireLocalEmailVerified: true,
        allowDifferentEmails: false,
        updateUserInfoOnLink: false,
      },
    },
    socialProviders: config.google
      ? {
          google: {
            clientId: config.google.clientId,
            clientSecret: config.google.clientSecret,
            prompt: 'select_account',
            // A Google account whose address Google hasn't verified gets no session.
            requireEmailVerification: true,
          },
        }
      : {},
    session: {
      expiresIn: config.sessionDays * 24 * 60 * 60,
      // Using the app extends the session at most once a day.
      updateAge: 24 * 60 * 60,
    },
    rateLimit: {
      enabled: rateLimit,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 3 },
        '/verify-email': { window: 60, max: 10 },
        '/request-password-reset': { window: 60, max: 3 },
        '/reset-password': { window: 60, max: 10 },
      },
    },
    advanced: {
      useSecureCookies: config.baseUrl.startsWith('https://'),
      ...(clientIpHeader ? { ipAddress: { ipAddressHeaders: [clientIpHeader] } } : {}),
    },
    plugins: [
      bearer({ requireSignature: true }),
      // The Google flow's hand-off to the app: single use, short-lived, stored hashed, and only
      // issued or redeemed by this server (never through Better Auth's public routes).
      oneTimeToken({ expiresIn: ONE_TIME_TOKEN_MINUTES, storeToken: 'hashed', disableClientRequest: true }),
    ],
    telemetry: { enabled: false },
    logger: {
      level: 'warn',
      log: (level, message) => log(`auth.${level}`, { message: redact(message) }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Better Auth's log messages describe what failed; keep them, but never an address, a token or a
 * long opaque value that could be one.
 */
export function redact(message: string): string {
  return String(message)
    .replace(/[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g, '<email>')
    .replace(/\b[A-Za-z0-9_\-.%+/=]{24,}\b/g, '<redacted>')
    .slice(0, 200);
}
