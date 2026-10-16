import { ConfigError, Env, integer, text } from '../env';
import { EmailConfig, loadEmailConfig } from './email';

/**
 * Authentication settings (Better Auth), from the environment only.
 *
 * Authentication is on when BETTER_AUTH_SECRET is set; it also needs DATABASE_URL (checked in
 * main). Google sign-in is on only when both Google variables are set: without them the server
 * still starts and the Google endpoints answer a safe `not-configured`. Email/password is on only
 * when email delivery is configured (see email.ts), because addresses must be confirmed.
 * Errors name variables, never values.
 */
export interface GoogleConfig {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface AuthConfig {
  /** Signs session tokens and cookies. Secret: never logged. */
  readonly secret: string;
  /** The service's public URL (scheme://host[:port]); OAuth redirect URIs are built from it. */
  readonly baseUrl: string;
  readonly google: GoogleConfig | null;
  /**
   * Delivery of "confirm your email" messages. null: email/password accounts are off (an address
   * must be confirmed before it becomes an account); Google sign-in can still be on.
   */
  readonly email: EmailConfig | null;
  /**
   * Where the Google flow may hand the app its one-time code: exact URLs only (the Android app's
   * deep link, and the web app's callback page during development).
   */
  readonly appRedirectUrls: readonly string[];
  readonly sessionDays: number;
}

/** The app's deep link (capacitor.config appId + a fixed path), used when AUTH_APP_REDIRECT_URLS is unset. */
export const DEFAULT_APP_REDIRECT_URL = 'com.fitnessapp.app://auth/callback';
const MIN_SECRET_LENGTH = 32;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

export function loadAuthConfig(env: Env): AuthConfig | null {
  const secret = text(env, 'BETTER_AUTH_SECRET');
  if (secret === null) {
    return null;
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new ConfigError(`BETTER_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters (generate one: see server/AUTH.md).`);
  }

  const rawBaseUrl = text(env, 'BETTER_AUTH_URL');
  if (rawBaseUrl === null) {
    throw new ConfigError('BETTER_AUTH_URL must be set to the server\'s public URL when BETTER_AUTH_SECRET is set.');
  }
  let base: URL;
  try {
    base = new URL(rawBaseUrl);
  } catch {
    throw new ConfigError('BETTER_AUTH_URL must be a URL such as https://api.example.com.');
  }
  const isHttps = base.protocol === 'https:';
  if (!isHttps && !(base.protocol === 'http:' && LOOPBACK.has(base.hostname))) {
    throw new ConfigError('BETTER_AUTH_URL must use https (plain http is allowed only for localhost).');
  }
  if (base.pathname !== '/' || base.search || base.hash) {
    throw new ConfigError('BETTER_AUTH_URL must be an origin only (no path, query or fragment).');
  }

  const clientId = text(env, 'GOOGLE_CLIENT_ID');
  const clientSecret = text(env, 'GOOGLE_CLIENT_SECRET');
  if ((clientId === null) !== (clientSecret === null)) {
    throw new ConfigError('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together (or both left unset).');
  }

  const appRedirectUrls = (text(env, 'AUTH_APP_REDIRECT_URLS') ?? DEFAULT_APP_REDIRECT_URL)
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  for (const url of appRedirectUrls) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ConfigError('AUTH_APP_REDIRECT_URLS must list absolute URLs, comma-separated.');
    }
    if (parsed.search || parsed.hash || ['javascript:', 'data:', 'file:'].includes(parsed.protocol)) {
      throw new ConfigError('AUTH_APP_REDIRECT_URLS entries must be plain URLs without a query or fragment.');
    }
  }

  return {
    secret,
    baseUrl: base.origin,
    google: clientId && clientSecret ? { clientId, clientSecret } : null,
    email: loadEmailConfig(env, { localOnly: !isHttps }),
    appRedirectUrls,
    sessionDays: integer(env, 'AUTH_SESSION_DAYS', 30, 1, 90),
  };
}
