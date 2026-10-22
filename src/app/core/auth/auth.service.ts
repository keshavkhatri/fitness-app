import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { AccountSession, AccountUser, AuthApi, AuthError, AuthProviders, AuthResult } from './auth-api';
import { challengeFor, createVerifier } from './pkce';
import { SECRET_STORE } from './session-store';

/**
 * Accounts are optional: a guest keeps using the app exactly as before, with everything on this
 * device. Signing in or out never reads, uploads or erases the app's local fitness data.
 */
export type AuthState =
  | { readonly status: 'restoring' }
  | { readonly status: 'guest' }
  /** `verified`: the server confirmed the session this launch (false while offline). */
  | { readonly status: 'signed-in'; readonly user: AccountUser; readonly verified: boolean };

/** The Android/iOS deep link the Google flow returns to (AndroidManifest intent filter; server allowlist). */
export const APP_AUTH_CALLBACK = 'com.stokeformfitness.app://auth/callback';
/** The web app's return page during development (also on the server allowlist). */
export const WEB_AUTH_CALLBACK_PATH = '/auth/callback';

const SESSION_KEY = 'session';
const VERIFIER_KEY = 'google-verifier';
/** A started Google sign-in is abandoned after this long (the server's code lives 3 minutes). */
const VERIFIER_MAX_AGE_MS = 15 * 60_000;

/** The platform pieces the Google flow needs; replaced in tests. */
export interface AuthPlatform {
  readonly native: boolean;
  readonly webOrigin: string;
  openBrowser(url: string): Promise<void>;
  closeBrowser(): Promise<void>;
  navigate(url: string): void;
  onDeepLink(listener: (url: string) => void): void;
  /**
   * The URL that launched the app. Android may close the app while the browser is open; the deep
   * link then starts it fresh, before any listener exists, and is only available here.
   */
  launchUrl(): Promise<string | null>;
  onBrowserClosed(listener: () => void): void;
}

/** Google failures the server reports by code on the deep link (server/src/auth/auth-routes.ts). */
const GOOGLE_ERRORS: Readonly<Record<string, AuthError>> = {
  'account-not-linked': 'account-not-linked',
  'email-not-verified': 'email-not-verified',
};
/** The app's reading of a failed Google redirect's `error` parameter. */
export const googleErrorOf = (error: string | null): AuthError => GOOGLE_ERRORS[error ?? ''] ?? 'google-failed';

export const AUTH_PLATFORM = new InjectionToken<AuthPlatform>('AUTH_PLATFORM', {
  providedIn: 'root',
  factory: () => ({
    native: Capacitor.isNativePlatform(),
    webOrigin: typeof location === 'undefined' ? '' : location.origin,
    // Chrome Custom Tabs / SFSafariViewController: Google refuses sign-in inside an embedded WebView.
    openBrowser: (url) => Browser.open({ url, presentationStyle: 'popover' }),
    closeBrowser: () => Browser.close().catch(() => undefined),
    navigate: (url) => location.assign(url),
    onDeepLink: (listener) => void App.addListener('appUrlOpen', ({ url }) => listener(url)),
    launchUrl: () =>
      App.getLaunchUrl()
        .then((launch) => launch?.url ?? null)
        .catch(() => null),
    onBrowserClosed: (listener) => void Browser.addListener('browserFinished', listener),
  }),
});

/** The saved Google verifier, or null if it is missing or damaged. */
function parsePendingGoogle(raw: string | null): { verifier: string; at: number } | null {
  try {
    const value = raw ? (JSON.parse(raw) as { verifier?: unknown; at?: unknown }) : null;
    return typeof value?.verifier === 'string' && typeof value.at === 'number' ? { verifier: value.verifier, at: value.at } : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(AuthApi);
  private readonly store = inject(SECRET_STORE);
  private readonly platform = inject(AUTH_PLATFORM);

  private readonly current = signal<AuthState>({ status: 'restoring' });
  private readonly signOutHooks: ((token: string) => Promise<unknown>)[] = [];
  readonly state = this.current.asReadonly();
  readonly user = computed(() => {
    const s = this.current();
    return s.status === 'signed-in' ? s.user : null;
  });
  /** Whether this build has an API at all (environment.apiBaseUrl). */
  readonly available = this.api.available;

  /** Google sign-in started and the app is waiting for the browser to come back. */
  readonly googlePending = signal(false);
  /** The outcome of the last Google attempt that came back through the deep link. */
  readonly googleError = signal<AuthError | null>(null);

  private restoring: Promise<void> | null = null;
  /** Deep links already handled: the same one can arrive both as the launch URL and as an event. */
  private readonly handledLinks = new Set<string>();

  constructor() {
    if (this.platform.native) {
      this.platform.onDeepLink((url) => void this.handleDeepLink(url));
      this.platform.onBrowserClosed(() => this.googlePending.set(false));
      void this.platform.launchUrl().then((url) => (url ? this.handleDeepLink(url) : undefined));
    }
  }

  /**
   * Reads the stored session and checks it with the server. Never blocks app start: the stored
   * account shows at once (unverified) and is confirmed, or cleared if the server rejects it.
   */
  restore(): Promise<void> {
    this.restoring ??= this.doRestore();
    return this.restoring;
  }

  /** Resolves once restore() settled (guards wait on it). */
  whenRestored(): Promise<void> {
    return this.restore();
  }

  /** The bearer token for authenticated API calls (future data endpoints). Never put it in app state. */
  async token(): Promise<string | null> {
    return (await this.readSession())?.token ?? null;
  }

  providers(): Promise<AuthResult<AuthProviders>> {
    return this.api.providers();
  }

  async signIn(email: string, password: string): Promise<AuthResult<AccountUser>> {
    return this.adopt(await this.api.signIn(email.trim(), password));
  }

  /**
   * Creates an account. `null`: a confirmation link was emailed and nobody is signed in yet; the
   * person signs in once the address is confirmed.
   */
  async signUp(name: string, email: string, password: string): Promise<AuthResult<AccountUser | null>> {
    const result = await this.api.signUp(name.trim(), email.trim(), password);
    if (result.ok && result.value === null) {
      return { ok: true, value: null };
    }
    return this.adopt(result as AuthResult<AccountSession>);
  }

  /** Asks for a password-reset link by email. The answer is the same for every address. */
  requestPasswordReset(email: string): Promise<AuthResult<void>> {
    return this.api.requestPasswordReset(email.trim());
  }

  /**
   * Runs at sign-out with the ending session's token, before the server ends it (e.g. to stop this
   * phone's push notifications). Failures are ignored: signing out never waits on them succeeding.
   */
  onSignOut(hook: (token: string) => Promise<unknown>): void {
    this.signOutHooks.push(hook);
  }

  /** Ends the session here at once and on the server when it can. Local fitness data is untouched. */
  async signOut(): Promise<void> {
    const session = await this.readSession();
    await this.store.remove(SESSION_KEY);
    this.current.set({ status: 'guest' });
    if (session) {
      await Promise.allSettled(this.signOutHooks.map((hook) => hook(session.token)));
      await this.api.signOut(session.token).catch(() => undefined);
    }
  }

  /**
   * Gives the signed-in account a display name (asked once when the account has none). Updates the
   * server first; the stored copy and state change only if it accepted.
   */
  async updateName(name: string): Promise<AuthResult<AccountUser>> {
    const session = await this.readSession();
    if (!session) {
      return { ok: false, error: 'invalid-credentials' };
    }
    const result = await this.api.updateName(session.token, name);
    if (!result.ok) {
      return result;
    }
    const user: AccountUser = { ...session.user, name };
    await this.store.set(SESSION_KEY, JSON.stringify({ token: session.token, user }));
    const state = this.current();
    if (state.status === 'signed-in') {
      this.current.set({ ...state, user });
    }
    return { ok: true, value: user };
  }

  /** Opens Google sign-in: Custom Tabs on Android (the answer returns through the deep link), a redirect on the web. */
  async startGoogle(): Promise<AuthResult<void>> {
    const verifier = createVerifier();
    const redirect = this.platform.native ? APP_AUTH_CALLBACK : `${this.platform.webOrigin}${WEB_AUTH_CALLBACK_PATH}`;
    const url = this.api.googleStartUrl(redirect, await challengeFor(verifier));
    if (!url) {
      return { ok: false, error: 'not-configured' };
    }
    await this.store.set(VERIFIER_KEY, JSON.stringify({ verifier, at: Date.now() }));
    this.googleError.set(null);
    if (this.platform.native) {
      this.googlePending.set(true);
      await this.platform.openBrowser(url);
    } else {
      this.platform.navigate(url);
    }
    return { ok: true, value: undefined };
  }

  /** Finishes Google sign-in with the one-time code from the redirect (web callback page or deep link). */
  async completeGoogle(code: string): Promise<AuthResult<AccountUser>> {
    const raw = await this.store.get(VERIFIER_KEY);
    await this.store.remove(VERIFIER_KEY);
    const pending = parsePendingGoogle(raw);
    if (!pending || Date.now() - pending.at > VERIFIER_MAX_AGE_MS) {
      return { ok: false, error: 'code-expired' };
    }
    return this.adopt(await this.api.exchange(code, pending.verifier));
  }

  private async handleDeepLink(url: string): Promise<void> {
    if (!url.startsWith(APP_AUTH_CALLBACK) || this.handledLinks.has(url)) {
      return;
    }
    this.handledLinks.add(url);
    await this.platform.closeBrowser();
    const params = new URL(url).searchParams;
    const code = params.get('code');
    const result: AuthResult<unknown> = code ? await this.completeGoogle(code) : { ok: false, error: googleErrorOf(params.get('error')) };
    this.googleError.set(result.ok ? null : result.error);
    this.googlePending.set(false);
  }

  private async adopt(result: AuthResult<AccountSession>): Promise<AuthResult<AccountUser>> {
    if (!result.ok) {
      return result;
    }
    await this.store.set(SESSION_KEY, JSON.stringify(result.value));
    this.current.set({ status: 'signed-in', user: result.value.user, verified: true });
    return { ok: true, value: result.value.user };
  }

  private async doRestore(): Promise<void> {
    const session = await this.readSession();
    if (!session) {
      this.current.set({ status: 'guest' });
      return;
    }
    this.current.set({ status: 'signed-in', user: session.user, verified: false });
    const checked = await this.api.me(session.token);
    if (!checked.ok) {
      return; // Offline or the server is down: keep the account, unverified.
    }
    if (checked.value === null) {
      await this.store.remove(SESSION_KEY);
      this.current.set({ status: 'guest' });
      return;
    }
    const user = checked.value;
    await this.store.set(SESSION_KEY, JSON.stringify({ token: session.token, user }));
    this.current.set({ status: 'signed-in', user, verified: true });
  }

  private async readSession(): Promise<AccountSession | null> {
    const raw = await this.store.get(SESSION_KEY);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<AccountSession>;
      return typeof parsed.token === 'string' && parsed.user && typeof parsed.user.email === 'string' ? (parsed as AccountSession) : null;
    } catch {
      return null;
    }
  }
}
