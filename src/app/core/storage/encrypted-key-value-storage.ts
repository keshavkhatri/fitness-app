import type { SecretStore } from '../auth/session-store';
import type { KeyValueStorage } from './key-value-storage';

/** Marks an encrypted value: version 1 is AES-256-GCM, a 12-byte random IV, then the ciphertext (base64). */
const PREFIX = 'enc1:';
/** Where the data key is kept in the secure store (Android Keystore-backed). Changing it orphans every value. */
const KEY_NAME = 'storage-key';
const IV_BYTES = 12;
/** The app's own keys (other libraries' storage is left alone). */
const APP_KEY_PREFIXES = ['fitness.', 'stokeform.'];

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/**
 * Device storage with every value encrypted (AES-256-GCM) before it reaches the underlying store, so the app's
 * health and fitness data isn't readable from the phone's files or a backup. The 256-bit key is random, made on
 * first use and kept only in the secure store (the Android Keystore protects it; it never leaves the phone).
 *
 * Values written before encryption existed are read as they are, and `encryptExisting()` re-writes them encrypted
 * (run once at startup). A value that can't be decrypted (the key is gone, e.g. the app's secure storage was cleared)
 * reads as missing: the app starts afresh rather than failing.
 */
export class EncryptedKeyValueStorage implements KeyValueStorage {
  private key: Promise<CryptoKey> | null = null;

  constructor(
    private readonly inner: KeyValueStorage,
    private readonly secrets: SecretStore,
  ) {}

  async get(key: string): Promise<string | null> {
    const raw = await this.inner.get(key);
    if (raw === null || !raw.startsWith(PREFIX)) {
      return raw;
    }
    try {
      const bytes = fromBase64(raw.slice(PREFIX.length));
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES) }, await this.dataKey(), bytes.slice(IV_BYTES));
      return new TextDecoder().decode(plain);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    await this.inner.set(key, await this.encrypt(value));
  }

  remove(key: string): Promise<void> {
    return this.inner.remove(key);
  }

  keys(): Promise<string[]> {
    return this.inner.keys();
  }

  /** Re-writes the app's values still stored as plain text (from before encryption) encrypted. Never throws. */
  async encryptExisting(): Promise<number> {
    let count = 0;
    const own = (await this.inner.keys().catch(() => [] as string[])).filter((k) => APP_KEY_PREFIXES.some((p) => k.startsWith(p)));
    for (const key of own) {
      const raw = await this.inner.get(key);
      if (raw !== null && !raw.startsWith(PREFIX)) {
        try {
          await this.inner.set(key, await this.encrypt(raw));
          count++;
        } catch {
          // Left as it is; tried again next launch.
        }
      }
    }
    return count;
  }

  private async encrypt(value: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.dataKey(), new TextEncoder().encode(value)));
    const out = new Uint8Array(IV_BYTES + cipher.length);
    out.set(iv);
    out.set(cipher, IV_BYTES);
    return PREFIX + toBase64Chunked(out);
  }

  private async hasEncryptedValues(): Promise<boolean> {
    for (const key of await this.inner.keys().catch(() => [] as string[])) {
      if ((await this.inner.get(key))?.startsWith(PREFIX)) {
        return true;
      }
    }
    return false;
  }

  /** The data key: read from the secure store, or made and stored there on first use (once, even if asked twice). */
  private dataKey(): Promise<CryptoKey> {
    this.key ??= (async () => {
      let stored = await this.secrets.get(KEY_NAME);
      // No key, but encrypted values exist: the secure store may just have failed to answer. Ask again before
      // concluding the key is gone (a new key makes every existing value unreadable).
      if (!stored && (await this.hasEncryptedValues())) {
        for (let attempt = 0; attempt < 3 && !stored; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
          stored = await this.secrets.get(KEY_NAME);
        }
      }
      if (!stored) {
        stored = toBase64(crypto.getRandomValues(new Uint8Array(32)));
        await this.secrets.set(KEY_NAME, stored);
      }
      return crypto.subtle.importKey('raw', fromBase64(stored), 'AES-GCM', false, ['encrypt', 'decrypt']);
    })().catch((e) => {
      this.key = null;
      throw e;
    });
    return this.key;
  }
}

/** base64 of large values without blowing the argument limit of String.fromCharCode. */
function toBase64Chunked(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}
