import { createAccountRoutes } from './account/account-routes';
import { ConfigError, loadConfig } from './config';
import { createAppHandler } from './app-handler';
import { Auth, ONE_TIME_TOKEN_MINUTES, createAuth } from './auth/auth';
import { createAuthRoutes } from './auth/auth-routes';
import { createEmailSender } from './auth/email';
import { createHandoffStore } from './auth/mobile-handoff';
import { createDatabase } from './db/database';
import { Log, createExtractionHandler } from './extraction-handler';
import { severityOf } from './log';
import { ErrorReporter, createSentryReporter } from './monitoring/sentry';
import { createNodeServer } from './node-server';
import { openAiResponsesClient } from './openai-client';
import { createFcmSender } from './push/fcm';
import { createPushRoutes } from './push/push-routes';
import { createSyncCipher } from './sync/sync-crypto';
import { createSyncRoutes } from './sync/sync-routes';
import { writeDevOutboxEmail } from '../tools/dev-outbox';

/** Set once the configuration is read: ERROR-level events also go to Sentry (when SENTRY_DSN is set). */
let reporter: ErrorReporter | null = null;
/** One JSON line per event; fields are codes, counts and durations only (see extraction-handler.ts). */
const log: Log = (event, fields = {}) => {
  const severity = severityOf(event);
  console.log(JSON.stringify({ time: new Date().toISOString(), severity, event, ...fields }));
  if (severity === 'ERROR') {
    reporter?.report(event, fields);
  }
};

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  console.error(error instanceof ConfigError ? `Invalid configuration: ${error.message}` : 'Invalid configuration.');
  process.exit(1);
}

if (config.sentry) {
  reporter = createSentryReporter({ dsn: config.sentry.dsn, environment: process.env['NODE_ENV'] ?? 'development', release: config.sentry.release });
}
// Anything not caught elsewhere is reported (by its error name only) before the process ends.
process.on('uncaughtException', (error) => {
  log('server.uncaught-error', { errorName: error instanceof Error ? error.name : typeof error });
  setTimeout(() => process.exit(1), 1_000);
});
process.on('unhandledRejection', (reason) => {
  log('server.unhandled-rejection-error', { errorName: reason instanceof Error ? reason.name : typeof reason });
});

if (!config.openAi) {
  log('server.not-configured', { missing: 'OPENAI_API_KEY and/or OPENAI_MODEL' });
}
if (config.allowedOrigins.length === 0) {
  log('server.no-allowed-origins');
}

const client = config.openAi ? openAiResponsesClient(config.openAi) : null;
// The pool connects lazily (on first use), so a missing or slow database never delays startup.
const database = config.database ? createDatabase(config.database, log) : null;
if (!database) {
  log('server.no-database');
}
// Accounts need both the auth settings and the database; either missing leaves them off (503) and
// everything else (health, readiness, InBody extraction) unchanged.
let auth: Auth | null = null;
if (!config.auth) {
  log('auth.not-configured', { missing: 'BETTER_AUTH_SECRET' });
} else if (!database) {
  log('auth.not-configured', { missing: 'DATABASE_URL' });
} else {
  const email = config.auth.email ? createEmailSender(config.auth.email, log, { writeOutbox: writeDevOutboxEmail }) : null;
  auth = createAuth({ config: config.auth, pool: database.pool, trustedOrigins: config.allowedOrigins, clientIpHeader: config.clientIpHeader, email, log });
  if (!config.auth.google) {
    log('auth.google-not-configured');
  }
  if (!email) {
    // Addresses must be confirmed by email, so without delivery there are no email/password accounts.
    log('auth.email-password-off', { missing: 'EMAIL_DELIVERY' });
  } else if (config.auth.email?.kind === 'dev-outbox') {
    log('auth.email-dev-outbox', { directory: config.auth.email.directory });
  }
}
const authRoutes = createAuthRoutes({
  auth,
  config: config.auth,
  allowedOrigins: config.allowedOrigins,
  handoffs: createHandoffStore(ONE_TIME_TOKEN_MINUTES * 60_000),
  log,
});
const extraction = createExtractionHandler({ config, client, log, readiness: database ? () => database.checkReadiness() : undefined });
if (!config.push) {
  log('push.not-configured', { missing: 'FIREBASE_PROJECT_ID' });
}
const pushRoutes = createPushRoutes({
  // Devices belong to accounts: without accounts there is nothing to register.
  store: auth && database ? database.pool : null,
  sender: config.push ? createFcmSender({ projectId: config.push.projectId, log }) : null,
  authenticate: (request) => authRoutes.authenticate(request),
  allowedOrigins: config.allowedOrigins,
  log,
});
const accountRoutes = createAccountRoutes({
  store: auth && database ? database.pool : null,
  authenticate: (request) => authRoutes.authenticate(request),
  allowedOrigins: config.allowedOrigins,
  log,
});
if (!config.sync) {
  log('sync.not-configured', { missing: 'SYNC_ENCRYPTION_KEY' });
}
const syncRoutes = createSyncRoutes({
  store: auth && database ? database.pool : null,
  cipher: config.sync ? createSyncCipher(config.sync.key) : null,
  authenticate: (request) => authRoutes.authenticate(request),
  allowedOrigins: config.allowedOrigins,
  log,
});
const server = createNodeServer(createAppHandler({ extraction, authRoutes, pushRoutes, accountRoutes, syncRoutes }));
server.listen(config.port, config.host, () => {
  const address = server.address();
  log('server.listening', { host: config.host, port: typeof address === 'object' && address ? address.port : config.port });
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () =>
    server.close(() => {
      void (database?.close() ?? Promise.resolve()).catch(() => undefined).finally(() => process.exit(0));
    }),
  );
}
