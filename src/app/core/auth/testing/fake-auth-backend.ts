import { AuthPlatform } from '../auth.service';

export const API = 'https://api.test';

/** One recorded call to the fake API. */
export interface FakeCall {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
  readonly credentials: RequestCredentials | undefined;
}

type Route = (call: FakeCall) => Response | Promise<Response>;

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export const USER = { id: 'user-1', email: 'alex@example.test', name: 'Alex', emailVerified: false };
export const TOKEN = 'session-token.signature';

/** A fetch double: routes by "METHOD /path"; unknown routes answer 404. Records every call. */
export function fakeAuthBackend(routes: Record<string, Route> = {}) {
  const calls: FakeCall[] = [];
  const fetch: typeof globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const call: FakeCall = { method, path: url.pathname + url.search, headers, body: init?.body ? JSON.parse(String(init.body)) : undefined, credentials: init?.credentials };
    calls.push(call);
    const route = routes[`${method} ${url.pathname}`];
    return route ? route(call) : json(404, { error: { code: 'not-found' } });
  };
  return { fetch, calls };
}

/** Typical successful answers. */
export const signedIn = () => json(200, { user: { ...USER, image: null, createdAt: 'x' } }, { 'set-auth-token': TOKEN });
/** Sign-up with email verification on: the account exists, no session, a link was emailed. */
export const confirmationSent = () => json(200, { token: null, user: { ...USER, image: null, createdAt: 'x' } });
export const PROVIDERS_ALL = { accounts: true, emailPassword: true, google: true };

export function fakePlatform(native: boolean) {
  const deepLinks: ((url: string) => void)[] = [];
  const closed: (() => void)[] = [];
  const platform: AuthPlatform & { opened: string[]; navigated: string[]; closes: number; launch: string | null } = {
    native,
    webOrigin: 'http://localhost:4200',
    launch: null,
    opened: [],
    navigated: [],
    closes: 0,
    openBrowser: async (url) => void platform.opened.push(url),
    closeBrowser: async () => void platform.closes++,
    navigate: (url) => void platform.navigated.push(url),
    onDeepLink: (listener) => void deepLinks.push(listener),
    launchUrl: async () => platform.launch,
    onBrowserClosed: (listener) => void closed.push(listener),
  };
  return { platform, deepLink: (url: string) => deepLinks.forEach((l) => l(url)), browserClosed: () => closed.forEach((l) => l()) };
}
