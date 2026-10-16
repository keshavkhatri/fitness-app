import { Injectable, InjectionToken, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

/** The signed-in person, as the server returns it. Never includes a password or token. */
export interface AccountUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
}

/** A session: the bearer token (kept only in the session store) and who it belongs to. */
export interface AccountSession {
  readonly token: string;
  readonly user: AccountUser;
}

export interface AuthProviders {
  readonly accounts: boolean;
  /** Off when the server can't send confirmation emails. */
  readonly emailPassword: boolean;
  readonly google: boolean;
}

/** Every failure the UI needs to tell apart; nothing from the server is shown verbatim. */
export type AuthError =
  | 'invalid-credentials'
  | 'email-taken'
  | 'weak-password'
  | 'invalid-email'
  | 'invalid-name'
  | 'rate-limited'
  | 'not-configured'
  | 'google-not-configured'
  | 'google-failed'
  /** The address isn't confirmed yet (signing in sent a new link), or Google reports it unverified. */
  | 'email-not-verified'
  /** Google sign-in found an account with this address that can't safely be joined (unconfirmed). */
  | 'account-not-linked'
  | 'code-expired'
  | 'network'
  | 'unavailable';

export type AuthResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AuthError };

/** The API's base URL (environment.apiBaseUrl); null hides accounts. Public, never a secret. */
export const AUTH_API_BASE_URL = new InjectionToken<string | null>('AUTH_API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiBaseUrl,
});

export const AUTH_FETCH = new InjectionToken<typeof fetch>('AUTH_FETCH', {
  providedIn: 'root',
  factory: () => (input, init) => fetch(input, init),
});

const TIMEOUT_MS = 20_000;

/**
 * The account endpoints of the Pulseform API (server/AUTH.md). Sessions travel as
 * `Authorization: Bearer <token>`; the app's WebView origin is a different site from the API, so
 * cookies are not used.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly base = inject(AUTH_API_BASE_URL);
  private readonly fetch = inject(AUTH_FETCH);

  get available(): boolean {
    return this.base !== null;
  }

  async providers(): Promise<AuthResult<AuthProviders>> {
    const response = await this.request('GET', '/v1/auth/providers');
    if (!response.ok) {
      return response;
    }
    if (response.value.status !== 200) {
      return { ok: false, error: 'unavailable' };
    }
    const body = (await response.value.json().catch(() => null)) as Partial<AuthProviders> | null;
    return { ok: true, value: { accounts: body?.accounts === true, emailPassword: body?.emailPassword === true, google: body?.google === true } };
  }

  /**
   * Creates the account. `null`: the server emailed a confirmation link and gave no session (the
   * person signs in after confirming). The server answers the same way for an address that already
   * has an account, so this never reveals which addresses are registered.
   */
  async signUp(name: string, email: string, password: string): Promise<AuthResult<AccountSession | null>> {
    const response = await this.request('POST', '/api/auth/sign-up/email', { name, email, password });
    if (!response.ok) {
      return response;
    }
    if (response.value.status !== 200) {
      return { ok: false, error: await errorOf(response.value) };
    }
    return this.sessionFrom(response.value, true);
  }

  async signIn(email: string, password: string): Promise<AuthResult<AccountSession>> {
    const response = await this.request('POST', '/api/auth/sign-in/email', { email, password });
    if (!response.ok) {
      return response;
    }
    if (response.value.status !== 200) {
      return { ok: false, error: await errorOf(response.value) };
    }
    const session = await this.sessionFrom(response.value, false);
    return session.ok && session.value === null ? { ok: false, error: 'unavailable' } : (session as AuthResult<AccountSession>);
  }

  /**
   * Asks the server to email a password-reset link. Always succeeds the same way whether or not the
   * address has an account (the server never says), so nothing here can reveal who is registered.
   * The link opens a page on the server in the browser, where the new password is chosen.
   */
  async requestPasswordReset(email: string): Promise<AuthResult<void>> {
    const response = await this.request('POST', '/api/auth/request-password-reset', { email });
    if (!response.ok) {
      return response;
    }
    return response.value.status === 200 ? { ok: true, value: undefined } : { ok: false, error: await errorOf(response.value) };
  }

  /** Who the token belongs to; `null` when the server says it is no longer valid. */
  async me(token: string): Promise<AuthResult<AccountUser | null>> {
    const response = await this.request('GET', '/v1/auth/me', undefined, token);
    if (!response.ok) {
      return response;
    }
    if (response.value.status === 401) {
      return { ok: true, value: null };
    }
    if (response.value.status !== 200) {
      return { ok: false, error: await errorOf(response.value) };
    }
    const body = (await response.value.json().catch(() => null)) as { user?: AccountUser } | null;
    return body?.user ? { ok: true, value: pickUser(body.user) } : { ok: false, error: 'unavailable' };
  }

  /** Ends the session on the server. Best effort: the app forgets the token either way. */
  async signOut(token: string): Promise<void> {
    await this.request('POST', '/api/auth/sign-out', {}, token);
  }

  /** The URL that starts Google sign-in in a browser; the server checks `redirect` against its allowlist. */
  googleStartUrl(redirect: string, challenge: string): string | null {
    if (!this.base) {
      return null;
    }
    return `${this.base}/v1/auth/google/start?${new URLSearchParams({ redirect, challenge }).toString()}`;
  }

  /** Trades the one-time code from the Google flow (plus the verifier only this app holds) for a session. */
  async exchange(code: string, verifier: string): Promise<AuthResult<AccountSession>> {
    const response = await this.request('POST', '/v1/auth/mobile/exchange', { code, verifier });
    if (!response.ok) {
      return response;
    }
    if (response.value.status !== 200) {
      const error = await errorOf(response.value);
      return { ok: false, error: error === 'unavailable' ? 'unavailable' : 'code-expired' };
    }
    const body = (await response.value.json().catch(() => null)) as { token?: string; user?: AccountUser } | null;
    return body?.token && body.user ? { ok: true, value: { token: body.token, user: pickUser(body.user) } } : { ok: false, error: 'unavailable' };
  }

  /** The session in a 200 answer; `null` when there is deliberately none (only allowed when `tokenOptional`). */
  private async sessionFrom(r: Response, tokenOptional: boolean): Promise<AuthResult<AccountSession | null>> {
    const token = r.headers.get('set-auth-token');
    const json = (await r.json().catch(() => null)) as { user?: AccountUser } | null;
    if (!json?.user) {
      return { ok: false, error: 'unavailable' };
    }
    if (!token) {
      return tokenOptional ? { ok: true, value: null } : { ok: false, error: 'unavailable' };
    }
    return { ok: true, value: { token, user: pickUser(json.user) } };
  }

  private async request(method: 'GET' | 'POST', path: string, body?: unknown, token?: string): Promise<AuthResult<Response>> {
    if (!this.base) {
      return { ok: false, error: 'not-configured' };
    }
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    if (token) {
      headers['authorization'] = `Bearer ${token}`;
    }
    try {
      const response = await this.fetch(`${this.base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'omit',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return { ok: true, value: response };
    } catch {
      return { ok: false, error: 'network' };
    }
  }
}

const pickUser = (user: AccountUser): AccountUser => ({
  id: String(user.id),
  email: String(user.email),
  name: String(user.name ?? ''),
  emailVerified: user.emailVerified === true,
});

/** Maps a failed answer to an AuthError from its status and Better Auth's error code (never its message). */
async function errorOf(response: Response): Promise<AuthError> {
  const body = (await response.json().catch(() => null)) as { code?: string; error?: { code?: string } } | null;
  const code = body?.code ?? body?.error?.code ?? '';
  if (response.status === 429) {
    return 'rate-limited';
  }
  if (code === 'auth-not-configured' || code === 'RESET_PASSWORD_DISABLED') {
    return 'not-configured';
  }
  if (code === 'google-not-configured') {
    return 'google-not-configured';
  }
  if (code === 'EMAIL_NOT_VERIFIED') {
    return 'email-not-verified';
  }
  if (response.status === 401 || code === 'INVALID_EMAIL_OR_PASSWORD') {
    return 'invalid-credentials';
  }
  if (code.startsWith('USER_ALREADY_EXISTS')) {
    return 'email-taken';
  }
  if (code === 'PASSWORD_TOO_SHORT' || code === 'PASSWORD_TOO_LONG') {
    return 'weak-password';
  }
  if (code === 'INVALID_EMAIL') {
    return 'invalid-email';
  }
  if (response.status === 422 || response.status === 400) {
    return code.includes('NAME') ? 'invalid-name' : 'invalid-email';
  }
  return 'unavailable';
}
