import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Server-side encryption of synced data (AES-256-GCM). Stored as iv | tag | ciphertext. The account and key are the
 * additional authenticated data, so a value can't be moved to another row or account without failing to decrypt.
 */
export interface SyncCipher {
  seal(userId: string, key: string, plain: string): Buffer;
  open(userId: string, key: string, sealed: Buffer): string;
}

export function createSyncCipher(secret: Buffer): SyncCipher {
  if (secret.length !== 32) {
    throw new Error('The sync key must be 32 bytes.');
  }
  const aad = (userId: string, key: string) => Buffer.from(`${userId}\u0000${key}`, 'utf8');
  return {
    seal(userId, key, plain) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', secret, iv);
      cipher.setAAD(aad(userId, key));
      const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]);
    },
    open(userId, key, sealed) {
      const decipher = createDecipheriv('aes-256-gcm', secret, sealed.subarray(0, IV_BYTES));
      decipher.setAAD(aad(userId, key));
      decipher.setAuthTag(sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      return Buffer.concat([decipher.update(sealed.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
    },
  };
}
