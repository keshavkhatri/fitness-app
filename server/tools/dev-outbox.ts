import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The local-only "outbox" for EMAIL_DELIVERY=dev-outbox: each email becomes a text file in a
 * git-ignored folder instead of being sent. Kept here, outside src/, because the API server itself
 * never touches the file system (see the storage test); the server refuses this mode unless
 * BETTER_AUTH_URL is localhost and NODE_ENV is not production.
 */
export async function writeDevOutboxEmail(directory: string, content: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  const file = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}.txt`;
  await writeFile(join(directory, file), content, { mode: 0o600 });
  return file;
}
