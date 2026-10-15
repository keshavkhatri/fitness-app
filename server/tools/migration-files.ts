import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { MigrationError, MigrationFile, checksumOf, parseMigrationFileName, validateMigrations } from '../src/db/migrations';

// The only place that reads the file system: the migration tool, never the API server (src/).

/** Reads `NNNN_name.sql` files, ordered by version. Other files are ignored; bad numbering is an error. */
export async function loadMigrations(directory: string): Promise<MigrationFile[]> {
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    throw new MigrationError('The migrations directory could not be read (set MIGRATIONS_DIR to its path).');
  }
  const files: MigrationFile[] = [];
  for (const entry of entries.filter((e) => e.endsWith('.sql')).sort()) {
    const parsed = parseMigrationFileName(entry);
    if (!parsed) {
      throw new MigrationError(`Migration file "${entry}" must be named NNNN_name.sql (four digits, lowercase letters, digits, underscores).`);
    }
    const sql = await readFile(join(directory, entry), 'utf8');
    files.push({ ...parsed, sql, checksum: checksumOf(sql) });
  }
  return validateMigrations(files);
}
