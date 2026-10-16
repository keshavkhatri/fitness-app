import { cleanupUnconfirmedAccounts, CleanupError, parseCleanupArgs } from '../src/auth/cleanup';
import { createClient } from '../src/db/database';
import { loadDatabaseConfig } from '../src/db/database-config';
import { ConfigError, text } from '../src/env';

/**
 * The cleanup job:  node cleanup.mjs [--apply] [--min-age-days N] [--limit N]
 *
 * Removes email/password accounts that were never confirmed (rules and safety: src/auth/cleanup.ts).
 * By default it only PREVIEWS: nothing is deleted without --apply. Run it as a Cloud Run job on a schedule
 * (server/AUTH.md), or by hand with `npm run server:cleanup` (preview) / `npm run server:cleanup:apply`.
 *
 * Uses DATABASE_URL (the runtime connection). Prints counts, dates and masked addresses only: never the
 * connection string, host, tokens or full addresses. Exit codes: 0 done, 1 failed, 2 bad usage.
 */
async function main(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  const options = parseCleanupArgs(argv);
  if (!options) {
    console.error('Usage: cleanup [--apply] [--min-age-days N] [--limit N]   (without --apply nothing is deleted)');
    return 2;
  }
  const config = loadDatabaseConfig(env, text(env, 'DATABASE_URL') ? 'DATABASE_URL' : 'MIGRATION_DATABASE_URL');
  if (!config) {
    console.error('Set DATABASE_URL to a PostgreSQL connection string. See server/DATABASE.md.');
    return 1;
  }
  const client = createClient(config);
  await client.connect();
  try {
    const result = await cleanupUnconfirmedAccounts(client, options);
    const verb = result.mode === 'apply' ? 'deleted' : 'would delete';
    for (const account of result.batch) {
      console.log(`${verb}  created ${account.created}  ${account.address}`);
    }
    console.log(
      JSON.stringify({
        event: 'auth.cleanup',
        mode: result.mode,
        minAgeDays: options.minAgeDays,
        limit: options.limit,
        eligibleTotal: result.eligibleTotal,
        inThisRun: result.batch.length,
        deleted: result.deleted,
      }),
    );
    if (result.mode === 'preview') {
      console.log(result.eligibleTotal === 0 ? 'Nothing to clean up.' : 'Preview only: nothing was deleted. Add --apply to delete these accounts.');
    }
    return 0;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main(process.argv.slice(2), process.env).then(
  (code) => process.exit(code),
  (error: unknown) => {
    if (error instanceof ConfigError || error instanceof CleanupError) {
      console.error(error.message);
    } else {
      const code = (error as { code?: string }).code;
      console.error(`Could not reach or query the database${code ? ` (${code})` : ''}. Nothing was deleted.`);
    }
    process.exit(1);
  },
);
