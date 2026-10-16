import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Binds the Google flow's one-time code to the app that started it (the PKCE idea).
 *
 * The app makes a random verifier, keeps it, and sends only its SHA-256 (the challenge) when it
 * opens the browser. The code comes back through a deep link, which another app on the device
 * could also receive; redeeming it needs the verifier, which never left the original app.
 *
 * Held in this process's memory for a few minutes: Cloud Run runs one instance for now
 * (`--max-instances 1`, as for the rate limits). Several instances would need a shared store.
 */
export interface HandoffStore {
  remember(code: string, challenge: string): void;
  /** Single use: the entry is removed whether or not the verifier matches. */
  redeem(code: string, verifier: string): boolean;
}

/** base64url, 43 characters: a SHA-256 digest, as the app sends it. */
export const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** RFC 7636 verifier: 43-128 unreserved characters. */
export const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

export const challengeOf = (verifier: string): string => createHash('sha256').update(verifier).digest('base64url');

export function createHandoffStore(ttlMs: number, now: () => number = Date.now, maxEntries = 1000): HandoffStore {
  const entries = new Map<string, { challenge: string; expiresAt: number }>();
  const sweep = () => {
    const t = now();
    for (const [code, entry] of entries) {
      if (entry.expiresAt <= t) {
        entries.delete(code);
      }
    }
  };
  return {
    remember(code, challenge) {
      sweep();
      if (entries.size >= maxEntries) {
        // Oldest first (Map keeps insertion order): an abandoned flow can't grow memory.
        entries.delete(entries.keys().next().value as string);
      }
      entries.set(code, { challenge, expiresAt: now() + ttlMs });
    },
    redeem(code, verifier) {
      const entry = entries.get(code);
      entries.delete(code);
      if (!entry || entry.expiresAt <= now() || !VERIFIER_PATTERN.test(verifier)) {
        return false;
      }
      const expected = Buffer.from(entry.challenge);
      const actual = Buffer.from(challengeOf(verifier));
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    },
  };
}
