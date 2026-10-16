-- Better Auth's core tables, in the schema reserved for them (0001). The statements are what the
-- installed better-auth 1.7.10 produces for its configuration here (Kysely, PostgreSQL,
-- `schemaName: 'auth'`, email/password, Google, the bearer and one-time-token plugins), taken from
-- `getMigrations(...).compileMigrations()` and checked in so they are versioned like every other
-- migration. A test (server/test/auth-schema.spec.ts) asks Better Auth again on every run and fails
-- if it would want anything more: a Better Auth upgrade that changes its schema needs a new
-- migration here, never `npx auth migrate` against a shared database.
--
-- Column names are Better Auth's (camelCase, quoted). Its ids are text, like pulseform's user_id.
-- Passwords are stored by Better Auth as salted scrypt hashes in account.password, never plain.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth."user" (
  "id"            text NOT NULL PRIMARY KEY,
  "name"          text NOT NULL,
  "email"         text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL,
  "image"         text,
  "createdAt"     timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt"     timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE auth."session" (
  "id"         text NOT NULL PRIMARY KEY,
  "expiresAt"  timestamptz NOT NULL,
  "token"      text NOT NULL UNIQUE,
  "createdAt"  timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt"  timestamptz NOT NULL,
  "ipAddress"  text,
  "userAgent"  text,
  "userId"     text NOT NULL REFERENCES auth."user" ("id") ON DELETE CASCADE
);

CREATE TABLE auth."account" (
  "id"                    text NOT NULL PRIMARY KEY,
  "accountId"             text NOT NULL,
  "providerId"            text NOT NULL,
  "userId"                text NOT NULL REFERENCES auth."user" ("id") ON DELETE CASCADE,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope"                 text,
  "password"              text,
  "createdAt"             timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt"             timestamptz NOT NULL
);

CREATE TABLE auth."verification" (
  "id"          text NOT NULL PRIMARY KEY,
  "identifier"  text NOT NULL,
  "value"       text NOT NULL,
  "expiresAt"   timestamptz NOT NULL,
  "createdAt"   timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt"   timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX "session_userId_idx" ON auth."session" ("userId");
CREATE INDEX "account_userId_idx" ON auth."account" ("userId");
CREATE INDEX "verification_identifier_idx" ON auth."verification" ("identifier");
