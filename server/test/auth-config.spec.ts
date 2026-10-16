import { describe, expect, it } from 'vitest';
import { ConfigError } from '../src/config';
import { DEFAULT_APP_REDIRECT_URL, loadAuthConfig } from '../src/auth/auth-config';
import { redact } from '../src/auth/auth';
import { challengeOf, createHandoffStore } from '../src/auth/mobile-handoff';

const SECRET = 'placeholder-secret-for-tests-only-0123456789';
const base = { BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: 'https://api.example.com' };
const message = (env: Record<string, string>) => {
  try {
    loadAuthConfig(env);
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return (e as Error).message;
  }
  throw new Error('expected a ConfigError');
};

describe('auth configuration', () => {
  it('is off without BETTER_AUTH_SECRET', () => {
    expect(loadAuthConfig({})).toBeNull();
  });

  it('reads the defaults: no Google, the app deep link, 30-day sessions', () => {
    expect(loadAuthConfig(base)).toEqual({ secret: SECRET, baseUrl: 'https://api.example.com', google: null, email: null, appRedirectUrls: [DEFAULT_APP_REDIRECT_URL], sessionDays: 30 });
  });

  it('enables Google only with both variables, and refuses one without the other', () => {
    expect(loadAuthConfig({ ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' })?.google).toEqual({ clientId: 'id', clientSecret: 's' });
    expect(message({ ...base, GOOGLE_CLIENT_ID: 'id' })).toMatch(/must be set together/);
  });

  it('requires a long secret and an https origin (http only for localhost), never echoing values', () => {
    expect(message({ ...base, BETTER_AUTH_SECRET: 'short-secret' })).toMatch(/at least 32/);
    expect(message({ ...base, BETTER_AUTH_SECRET: 'short-secret' })).not.toContain('short-secret');
    expect(message({ BETTER_AUTH_SECRET: SECRET })).toMatch(/BETTER_AUTH_URL must be set/);
    expect(message({ ...base, BETTER_AUTH_URL: 'http://api.example.com' })).toMatch(/https/);
    expect(message({ ...base, BETTER_AUTH_URL: 'https://api.example.com/auth' })).toMatch(/origin only/);
    expect(loadAuthConfig({ ...base, BETTER_AUTH_URL: 'http://localhost:8787' })?.baseUrl).toBe('http://localhost:8787');
  });

  it('reads app redirect URLs as exact URLs without query or fragment', () => {
    expect(loadAuthConfig({ ...base, AUTH_APP_REDIRECT_URLS: 'com.fitnessapp.app://auth/callback, http://localhost:4200/auth/callback' })?.appRedirectUrls).toEqual([
      'com.fitnessapp.app://auth/callback',
      'http://localhost:4200/auth/callback',
    ]);
    expect(message({ ...base, AUTH_APP_REDIRECT_URLS: 'https://x.example/cb?next=1' })).toMatch(/without a query/);
    expect(message({ ...base, AUTH_APP_REDIRECT_URLS: 'javascript:alert(1)' })).toMatch(/plain URLs/);
  });
});

describe('the Google hand-off store', () => {
  const verifier = 'abcdefghijklmnopqrstuvwxyz0123456789-._~ABCDEFG';

  it('redeems a code once, only with the verifier whose hash it was given', () => {
    const store = createHandoffStore(60_000);
    store.remember('code-1', challengeOf(verifier));
    expect(store.redeem('code-1', verifier)).toBe(true);
    expect(store.redeem('code-1', verifier)).toBe(false);

    store.remember('code-2', challengeOf(verifier));
    expect(store.redeem('code-2', `${verifier}x`)).toBe(false);
    expect(store.redeem('code-2', verifier)).toBe(false); // burned by the failed attempt
  });

  it('expires codes, and keeps memory bounded', () => {
    let now = 0;
    const store = createHandoffStore(1000, () => now, 2);
    store.remember('old', challengeOf(verifier));
    now = 1001;
    expect(store.redeem('old', verifier)).toBe(false);
    store.remember('a', challengeOf(verifier));
    store.remember('b', challengeOf(verifier));
    store.remember('c', challengeOf(verifier)); // evicts "a"
    expect(store.redeem('a', verifier)).toBe(false);
    expect(store.redeem('c', verifier)).toBe(true);
  });

  it('refuses a malformed verifier', () => {
    const store = createHandoffStore(60_000);
    store.remember('code', challengeOf('short'));
    expect(store.redeem('code', 'short')).toBe(false);
  });
});

describe('log redaction', () => {
  it('removes addresses and long token-like values, and caps the length', () => {
    const out = redact('Invalid password for jane.doe@example.com with token eyJhbGciOiJIUzI1NiJ9abcdefghijklmnop.sig');
    expect(out).not.toContain('jane.doe@example.com');
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiJ9abcdefghijklmnop');
    expect(out).toContain('Invalid password');
    expect(redact('x'.repeat(500)).length).toBeLessThanOrEqual(200);
  });
});
