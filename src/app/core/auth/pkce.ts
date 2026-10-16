/**
 * The Google sign-in hand-off is bound to this app (server/src/auth/mobile-handoff.ts): the app
 * keeps a random verifier and sends only its SHA-256 (base64url) when opening the browser; the
 * one-time code that comes back is useless without the verifier.
 */
const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** 32 random bytes as 43 base64url characters (RFC 7636). */
export function createVerifier(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function challengeFor(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}
