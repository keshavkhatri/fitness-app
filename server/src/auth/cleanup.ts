import type { SqlClient } from '../db/migrations';

/**
 * Removes email/password accounts that were never confirmed. Run as a job (tools/cleanup.ts), never from
 * the API process: Cloud Run instances scale to zero, so an in-process timer would not run reliably.
 *
 * An account is eligible only if ALL of these hold, checked again in the same statement that deletes it:
 *  - its email address was never confirmed (`emailVerified` is false) and it is older than `minAgeDays`
 *    (at least MIN_AGE_DAYS_FLOOR: longer than any confirmation or reset link stays valid);
 *  - its only sign-in method is a password (a `credential` account, and no Google or other provider);
 *  - it has no session, ever (an account that was used is not a leftover);
 *  - it has no unexpired verification row (a password reset or confirmation in progress);
 *  - no row in any table that references `auth."user"` outside the `auth` schema (every Pulseform data
 *    table). These tables are discovered from the database's own foreign keys, so a table added later is
 *    protected without touching this file. If none can be found the job refuses to delete anything.
 *
 * Concurrency: candidates are selected `FOR UPDATE SKIP LOCKED`, so an account being confirmed at that
 * moment is skipped, and one we have locked cannot be confirmed until we finish (it is then gone, and
 * the confirmation link answers "not valid"). The DELETE repeats every condition, so an account that
 * changed since selection is left alone. A second run finds nothing: the job is idempotent.
 */
export const DEFAULT_MIN_AGE_DAYS = 7;
export const MIN_AGE_DAYS_FLOOR = 2;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

export class CleanupError extends Error {}

export interface CleanupOptions {
  /** Only accounts at least this old (days). */
  readonly minAgeDays: number;
  /** At most this many accounts per run, oldest first. */
  readonly limit: number;
  /** false (the default of the command): report what would be deleted and change nothing. */
  readonly apply: boolean;
  /** Test seam: runs after candidates are selected and before they are deleted. */
  readonly beforeDelete?: () => Promise<void>;
}

export interface CleanupCandidate {
  /** For previews only. Never the full address. */
  readonly created: string;
  readonly address: string;
}

export interface CleanupResult {
  readonly mode: 'preview' | 'apply';
  /** Eligible accounts in total (before the per-run limit). */
  readonly eligibleTotal: number;
  /** This run's batch: at most `limit`, oldest first. */
  readonly batch: readonly CleanupCandidate[];
  /** Accounts actually deleted (always 0 in preview). */
  readonly deleted: number;
}

/**
 * The command line of tools/cleanup.ts. Nothing deletes unless `--apply` is present: the default is a preview.
 * Anything unrecognised (a typo such as `--aply`, a stray argument) returns null so the command refuses to
 * run at all rather than guessing.
 */
export function parseCleanupArgs(argv: readonly string[]): Pick<CleanupOptions, 'apply' | 'minAgeDays' | 'limit'> | null {
  let apply = false;
  let minAgeDays = DEFAULT_MIN_AGE_DAYS;
  let limit = DEFAULT_LIMIT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') {
      apply = true;
    } else if (arg === '--min-age-days' || arg === '--limit') {
      const value = Number(argv[++i]);
      if (arg === '--limit') {
        limit = value;
      } else {
        minAgeDays = value;
      }
    } else {
      return null;
    }
  }
  return { apply, minAgeDays, limit };
}

/** Validates the numbers the command accepts. */
export function checkOptions({ minAgeDays, limit }: Pick<CleanupOptions, 'minAgeDays' | 'limit'>): void {
  if (!Number.isInteger(minAgeDays) || minAgeDays < MIN_AGE_DAYS_FLOOR || minAgeDays > 3650) {
    throw new CleanupError(`--min-age-days must be a whole number from ${MIN_AGE_DAYS_FLOOR} to 3650.`);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new CleanupError(`--limit must be a whole number from 1 to ${MAX_LIMIT}.`);
  }
}

/** a***@e***.com: enough to recognise your own test address, not to read a stranger's. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) {
    return '***';
  }
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${email[0]}***@${host[0] ?? ''}***${tld}`;
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

interface DataColumn {
  readonly table: string;
  readonly column: string;
}

/** Every column outside `auth` that holds a foreign key to `auth."user"`: where a person's data lives. */
async function dataColumns(client: SqlClient): Promise<DataColumn[]> {
  const { rows } = await client.query(
    `SELECT n.nspname AS schema, c.relname AS table_name, a.attname AS column_name
       FROM pg_constraint k
       JOIN pg_class c ON c.oid = k.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
      WHERE k.contype = 'f'
        AND k.confrelid = 'auth."user"'::regclass
        AND cardinality(k.conkey) = 1
        AND n.nspname <> 'auth'
      ORDER BY 1, 2, 3`,
  );
  return rows.map((r) => ({ table: `${quote(String(r['schema']))}.${quote(String(r['table_name']))}`, column: quote(String(r['column_name'])) }));
}

/** The WHERE conditions for alias `u`; `$ageParam` is the minimum age in days. */
function eligibility(columns: readonly DataColumn[], ageParam: number): string {
  const noData = columns.map((c) => `AND NOT EXISTS (SELECT 1 FROM ${c.table} d WHERE d.${c.column} = u.id)`);
  return [
    `u."emailVerified" = false`,
    `AND u."createdAt" < now() - make_interval(days => $${ageParam}::int)`,
    `AND EXISTS (SELECT 1 FROM auth.account a WHERE a."userId" = u.id AND a."providerId" = 'credential')`,
    `AND NOT EXISTS (SELECT 1 FROM auth.account a WHERE a."userId" = u.id AND a."providerId" <> 'credential')`,
    `AND NOT EXISTS (SELECT 1 FROM auth.session s WHERE s."userId" = u.id)`,
    `AND NOT EXISTS (SELECT 1 FROM auth.verification v WHERE v.value = u.id AND v."expiresAt" > now())`,
    ...noData,
  ].join('\n        ');
}

export async function cleanupUnconfirmedAccounts(client: SqlClient, options: CleanupOptions): Promise<CleanupResult> {
  checkOptions(options);
  const columns = await dataColumns(client);
  if (columns.length === 0) {
    throw new CleanupError('Cannot tell which accounts own data (no table references auth."user"). Nothing was deleted. Run the migrations first.');
  }

  await client.query('BEGIN');
  try {
    const total = await client.query(`SELECT count(*)::int AS n FROM auth."user" u WHERE ${eligibility(columns, 1)}`, [options.minAgeDays]);
    const eligibleTotal = Number(total.rows[0]?.['n'] ?? 0);

    const selected = await client.query(
      `SELECT u.id, u.email, u."createdAt" AS created
         FROM auth."user" u
        WHERE ${eligibility(columns, 1)}
        ORDER BY u."createdAt", u.id
        LIMIT $2
          FOR UPDATE OF u SKIP LOCKED`,
      [options.minAgeDays, options.limit],
    );
    const batch: CleanupCandidate[] = selected.rows.map((r) => ({
      created: new Date(r['created'] as string | Date).toISOString().slice(0, 10),
      address: maskEmail(String(r['email'])),
    }));
    const ids = selected.rows.map((r) => String(r['id']));

    let deleted = 0;
    if (options.apply && ids.length > 0) {
      await options.beforeDelete?.();
      const removed = await client.query(
        `DELETE FROM auth."user" u
          WHERE u.id = ANY($2::text[])
            AND ${eligibility(columns, 1)}
        RETURNING u.id`,
        [options.minAgeDays, ids],
      );
      deleted = removed.rows.length;
    }
    await client.query(options.apply ? 'COMMIT' : 'ROLLBACK');
    return { mode: options.apply ? 'apply' : 'preview', eligibleTotal, batch, deleted };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}
