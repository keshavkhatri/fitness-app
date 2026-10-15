-- Daily self-reported check-ins (domain: DailyCheckIn): at most one value per day for each of steps
-- and recovery, a new entry replacing that day's value. The streak is derived, never stored.
CREATE TABLE pulseform.daily_check_ins (
  user_id     text NOT NULL,
  date        date NOT NULL,
  steps       integer CHECK (steps BETWEEN 0 AND 100000),
  recovery    text CHECK (recovery IN ('poor', 'fair', 'good', 'great')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date),
  CONSTRAINT has_a_value CHECK (steps IS NOT NULL OR recovery IS NOT NULL)
);

-- In-app reminders are rebuilt from the user's data each day; only which day-stable ids were read
-- is remembered (the app keeps the newest 200). Nothing is pushed or scheduled by the server.
CREATE TABLE pulseform.notification_reads (
  user_id          text NOT NULL,
  notification_id  text NOT NULL CHECK (char_length(notification_id) BETWEEN 1 AND 200),
  read_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_id)
);
