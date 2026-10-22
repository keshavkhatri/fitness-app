-- Cloud backup and sync of the app's on-phone data (opt-in; app: core/sync). One row per account and storage key
-- (e.g. "fitness.workout-logs"): the latest value of that piece of data, encrypted on the server with AES-256-GCM (stored as base64)
-- under SYNC_ENCRYPTION_KEY (a database copy alone reveals nothing), bound to its account and key. Last writer wins
-- per key, by the time the change was made on the phone (`modified_at`). `revision` grows with every accepted
-- change, so a phone asks only for what changed since it last looked. A NULL value is a deletion (kept so other
-- phones learn of it). Rows go with the account (ON DELETE CASCADE), or when the person turns sync off.
CREATE SEQUENCE stokeform.sync_revision AS bigint;

CREATE TABLE stokeform.sync_entries (
  user_id      text NOT NULL REFERENCES auth."user" ("id") ON DELETE CASCADE,
  key          text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 120),
  -- base64 of iv | tag | ciphertext (text, not bytea: the schema keeps binary data out of the database).
  value        text CHECK (value IS NULL OR char_length(value) <= 8388608),
  modified_at  timestamptz NOT NULL,
  revision     bigint NOT NULL DEFAULT nextval('stokeform.sync_revision'),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE INDEX sync_entries_user_revision ON stokeform.sync_entries (user_id, revision);
