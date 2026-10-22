-- Devices that receive push notifications (Firebase Cloud Messaging): one row per app install's
-- registration token. A token belongs to one account at a time (UNIQUE): signing in with another
-- account on the same phone moves it. Rows go when the account is deleted, when the app removes them
-- at sign-out, or when Firebase reports the token as no longer valid. Nothing about the person's
-- health is stored here or sent in a push.
CREATE TABLE stokeform.push_devices (
  user_id       text NOT NULL REFERENCES auth."user" ("id") ON DELETE CASCADE,
  token         text NOT NULL UNIQUE CHECK (char_length(token) BETWEEN 20 AND 4096),
  platform      text NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, token)
);
