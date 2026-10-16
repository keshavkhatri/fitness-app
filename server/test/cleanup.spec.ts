import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CleanupError, DEFAULT_LIMIT, DEFAULT_MIN_AGE_DAYS, MAX_LIMIT, MIN_AGE_DAYS_FLOOR, cleanupUnconfirmedAccounts, maskEmail, parseCleanupArgs } from '../src/auth/cleanup';
import { migrateUp } from '../src/db/migrations';
import { loadMigrations } from '../tools/migration-files';
import { MIGRATIONS_DIRECTORY, newDatabase, sqlClient } from './pglite';

// The cleanup rules run against the repository's real migrations on a real PostgreSQL engine (PGlite).
// Every case is a separate account; nothing here touches Neon.
let db: PGlite;
const client = () => sqlClient(db);
beforeAll(async () => {
  db = await newDatabase();
  await migrateUp(client(), await loadMigrations(MIGRATIONS_DIRECTORY));
}, 60_000);
beforeEach(async () => {
  // Cascades to accounts, sessions and every Pulseform table that references the user.
  await db.query('DELETE FROM auth."user"');
  await db.query('DELETE FROM auth.verification');
});

interface Seed {
  readonly id: string;
  readonly ageDays?: number;
  readonly verified?: boolean;
  /** Sign-in methods the account has: default a password. */
  readonly providers?: readonly string[];
}
/** Inserts an account like Better Auth would: a user row, plus one account row per sign-in method. */
async function seed({ id, ageDays = 30, verified = false, providers = ['credential'] }: Seed) {
  await db.query(`INSERT INTO auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1, 'Name', $2, $3, now() - make_interval(days => $4::int), now())`, [
    id,
    `${id}@example.test`,
    verified,
    ageDays,
  ]);
  for (const provider of providers) {
    await db.query(`INSERT INTO auth.account (id, "accountId", "providerId", "userId", password, "updatedAt") VALUES ($1, $2, $3, $2, $4, now())`, [
      `${id}-${provider}`,
      id,
      provider,
      provider === 'credential' ? 'hash' : null,
    ]);
  }
}
const exists = async (id: string) => Number((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM auth."user" WHERE id = $1', [id])).rows[0].n) === 1;
const ids = async () => (await db.query<{ id: string }>('SELECT id FROM auth."user" ORDER BY id')).rows.map((r) => r.id);
const preview = (extra: Partial<Parameters<typeof cleanupUnconfirmedAccounts>[1]> = {}) => cleanupUnconfirmedAccounts(client(), { minAgeDays: 7, limit: 50, apply: false, ...extra });
const apply = (extra: Partial<Parameters<typeof cleanupUnconfirmedAccounts>[1]> = {}) => preview({ apply: true, ...extra });

describe('which accounts are eligible', () => {
  it('an old, never-confirmed password account is', async () => {
    await seed({ id: 'old-unconfirmed' });
    const result = await preview();
    expect(result.eligibleTotal).toBe(1);
    expect(result.batch).toHaveLength(1);
  });

  it('a confirmed account never is, however old', async () => {
    await seed({ id: 'verified', verified: true, ageDays: 400 });
    expect((await apply()).deleted).toBe(0);
    expect(await exists('verified')).toBe(true);
  });

  it('an account linked to Google (alone or beside a password) never is', async () => {
    await seed({ id: 'google-only', providers: ['google'] });
    await seed({ id: 'google-and-password', providers: ['credential', 'google'] });
    expect((await apply()).deleted).toBe(0);
    expect(await ids()).toEqual(['google-and-password', 'google-only']);
  });

  it('an account with no sign-in method at all is left alone too (only password accounts are targeted)', async () => {
    await seed({ id: 'no-methods', providers: [] });
    expect((await apply()).deleted).toBe(0);
    expect(await exists('no-methods')).toBe(true);
  });

  it('a recent account never is: only accounts older than the minimum age', async () => {
    await seed({ id: 'fresh', ageDays: 3 });
    await seed({ id: 'just-inside', ageDays: 6 });
    await seed({ id: 'old-enough', ageDays: 8 });
    const result = await apply();
    expect(result.deleted).toBe(1);
    expect(await ids()).toEqual(['fresh', 'just-inside']);
  });

  it('an account that ever had a session never is (it was used)', async () => {
    await seed({ id: 'was-used' });
    await db.query(`INSERT INTO auth.session (id, "expiresAt", token, "updatedAt", "userId") VALUES ('s1', now() - interval '1 day', 't1', now(), 'was-used')`);
    expect((await apply()).deleted).toBe(0);
    expect(await exists('was-used')).toBe(true);
  });

  it('an account with a password reset or confirmation still pending never is; an expired one does not protect it', async () => {
    await seed({ id: 'resetting' });
    await seed({ id: 'long-ago' });
    await db.query(`INSERT INTO auth.verification (id, identifier, value, "expiresAt") VALUES ('v1', 'reset-password:abc', 'resetting', now() + interval '30 minutes')`);
    await db.query(`INSERT INTO auth.verification (id, identifier, value, "expiresAt") VALUES ('v2', 'reset-password:def', 'long-ago', now() - interval '3 days')`);
    const result = await apply();
    expect(result.deleted).toBe(1);
    expect(await ids()).toEqual(['resetting']);
  });
});

describe('accounts with data are never deleted', () => {
  it('any row in any Pulseform table that references the user protects it', async () => {
    await seed({ id: 'has-weight' });
    await seed({ id: 'has-food' });
    await seed({ id: 'has-prefs' });
    await seed({ id: 'empty' });
    await db.query(`INSERT INTO pulseform.weight_entries (user_id, id, date, weight_kg, created_at, updated_at) VALUES ('has-weight', 'w1', '2026-10-15', 80, now(), now())`);
    await db.query(`INSERT INTO pulseform.user_preferences (user_id, theme_preference) VALUES ('has-prefs', 'system')`);
    await db.query(
      `INSERT INTO pulseform.food_entries (user_id, id, date, meal, name, quantity, unit, calories, protein_grams, carbohydrate_grams, fat_grams, created_at, updated_at)
       VALUES ('has-food', 'f1', '2026-10-15', 'lunch', 'Rice', 1, 'serving', 200, 4, 40, 1, now(), now())`,
    );
    const result = await apply();
    expect(result.deleted).toBe(1);
    expect(await ids()).toEqual(['has-food', 'has-prefs', 'has-weight']);
  });

  it('a table added later is protected too, because tables are found from the foreign keys', async () => {
    await db.query('CREATE TABLE pulseform.future_feature (user_id text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE, note text)');
    try {
      await seed({ id: 'has-future-data' });
      await seed({ id: 'empty' });
      await db.query(`INSERT INTO pulseform.future_feature (user_id, note) VALUES ('has-future-data', 'x')`);
      expect((await apply()).deleted).toBe(1);
      expect(await ids()).toEqual(['has-future-data']);
    } finally {
      await db.query('DROP TABLE pulseform.future_feature');
    }
  });

  it('refuses to delete anything if it cannot tell where user data lives', async () => {
    await seed({ id: 'old-unconfirmed' });
    // A database without the ownership foreign keys: the same rows, but nothing says which tables hold data.
    const bare = await newDatabase();
    await bare.exec(`CREATE SCHEMA auth; CREATE TABLE auth."user" (id text PRIMARY KEY, name text, email text, "emailVerified" boolean, "createdAt" timestamptz, "updatedAt" timestamptz)`);
    await expect(cleanupUnconfirmedAccounts(sqlClient(bare), { minAgeDays: 7, limit: 50, apply: true })).rejects.toThrow(/Nothing was deleted/);
    expect(await exists('old-unconfirmed')).toBe(true);
    await bare.close();
  });
});

describe('previewing, applying, and repeating', () => {
  it('a preview changes nothing and shows only masked addresses and dates', async () => {
    await seed({ id: 'a-person' });
    const result = await preview();
    expect(result).toMatchObject({ mode: 'preview', eligibleTotal: 1, deleted: 0 });
    expect(await exists('a-person')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('a-person@example.test');
    expect(result.batch[0].address).toBe('a***@e***.test');
    expect(result.batch[0].created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('applying deletes the account with its password and leaves nothing behind; running again finds nothing', async () => {
    await seed({ id: 'gone' });
    const first = await apply();
    expect(first).toMatchObject({ mode: 'apply', deleted: 1 });
    expect(await exists('gone')).toBe(false);
    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM auth.account WHERE "userId" = 'gone'`)).rows[0].n).toBe(0);
    const second = await apply();
    expect(second).toMatchObject({ eligibleTotal: 0, deleted: 0 });
  });

  it('processes at most `limit` accounts per run, oldest first, and the rest follow on later runs', async () => {
    await seed({ id: 'c-newest', ageDays: 10 });
    await seed({ id: 'a-oldest', ageDays: 50 });
    await seed({ id: 'b-middle', ageDays: 20 });
    const first = await apply({ limit: 2 });
    expect(first).toMatchObject({ eligibleTotal: 3, deleted: 2 });
    expect(await ids()).toEqual(['c-newest']);
    expect((await apply({ limit: 2 })).deleted).toBe(1);
    expect(await ids()).toEqual([]);
  });

  it('validates its numbers: no minimum age below 2 days (confirmation links last 24 hours), a sane limit', async () => {
    await seed({ id: 'old' });
    for (const bad of [{ minAgeDays: 1 }, { minAgeDays: 0 }, { minAgeDays: 2.5 }, { limit: 0 }, { limit: 501 }]) {
      await expect(apply(bad)).rejects.toThrow(CleanupError);
    }
    expect(await exists('old')).toBe(true);
  });
});

describe('races', () => {
  it('an account confirmed after it was selected but before the delete is left alone', async () => {
    await seed({ id: 'confirmed-just-now' });
    await seed({ id: 'still-unconfirmed' });
    const result = await apply({
      // The owner opens their confirmation link at exactly the wrong moment.
      beforeDelete: async () => void (await db.query(`UPDATE auth."user" SET "emailVerified" = true WHERE id = 'confirmed-just-now'`)),
    });
    expect(result.deleted).toBe(1);
    expect(await ids()).toEqual(['confirmed-just-now']);
  });

  it('an account that gained data, a Google link or a session in that window is left alone', async () => {
    await seed({ id: 'gained-data' });
    await seed({ id: 'gained-google' });
    await seed({ id: 'signed-in' });
    await apply({
      beforeDelete: async () => {
        await db.query(`INSERT INTO pulseform.weight_entries (user_id, id, date, weight_kg, created_at, updated_at) VALUES ('gained-data', 'w', '2026-10-15', 80, now(), now())`);
        await db.query(`INSERT INTO auth.account (id, "accountId", "providerId", "userId", "updatedAt") VALUES ('g', 'x', 'google', 'gained-google', now())`);
        await db.query(`INSERT INTO auth.session (id, "expiresAt", token, "updatedAt", "userId") VALUES ('s', now() + interval '1 day', 'tok', now(), 'signed-in')`);
      },
    });
    expect(await ids()).toEqual(['gained-data', 'gained-google', 'signed-in']);
  });

  it('a failure part-way rolls everything back: no half-deleted batch', async () => {
    await seed({ id: 'one' });
    await expect(
      apply({
        beforeDelete: async () => {
          throw new Error('boom');
        },
      }),
    ).rejects.toThrow('boom');
    expect(await ids()).toEqual(['one']);
    // And the connection is usable afterwards (the transaction was closed).
    expect((await preview()).eligibleTotal).toBe(1);
  });
});

describe('masking', () => {
  it('shows enough to recognise your own address, not to read a stranger’s', () => {
    expect(maskEmail('alex.smith@example.com')).toBe('a***@e***.com');
    expect(maskEmail('x@y.co.uk')).toBe('x***@y***.uk');
    expect(maskEmail('not-an-address')).toBe('***');
  });
});

describe('the command line: previews unless told otherwise', () => {
  it('with no arguments it is a PREVIEW of accounts at least 7 days old, 50 at a time', () => {
    expect(parseCleanupArgs([])).toEqual({ apply: false, minAgeDays: 7, limit: 50 });
    expect([DEFAULT_MIN_AGE_DAYS, DEFAULT_LIMIT, MIN_AGE_DAYS_FLOOR, MAX_LIMIT]).toEqual([7, 50, 2, 500]);
  });

  it('deletes only with an explicit --apply, and options alone never turn it on', () => {
    expect(parseCleanupArgs(['--apply'])).toMatchObject({ apply: true });
    expect(parseCleanupArgs(['--limit', '10', '--min-age-days', '14'])).toEqual({ apply: false, minAgeDays: 14, limit: 10 });
    expect(parseCleanupArgs(['--min-age-days', '14', '--apply', '--limit', '5'])).toEqual({ apply: true, minAgeDays: 14, limit: 5 });
  });

  it('refuses to run on anything it does not recognise: a typo can never mean "apply" or "something else"', () => {
    for (const argv of [['--aply'], ['apply'], ['--yes'], ['--apply=true'], ['--force'], ['-a'], ['--apply', 'now']]) {
      expect(parseCleanupArgs(argv), argv.join(' ')).toBeNull();
    }
  });

  it('numbers that are missing or not numbers are caught by validation before anything runs', async () => {
    const missing = parseCleanupArgs(['--limit'])!;
    expect(Number.isNaN(missing.limit)).toBe(true);
    await expect(cleanupUnconfirmedAccounts(client(), { ...missing, apply: true })).rejects.toThrow(CleanupError);
    const age = parseCleanupArgs(['--min-age-days', 'soon'])!;
    await expect(cleanupUnconfirmedAccounts(client(), { ...age, apply: true })).rejects.toThrow(CleanupError);
  });
});
