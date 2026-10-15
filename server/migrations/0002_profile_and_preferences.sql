-- One fitness profile per user (domain: UserFitnessProfile). The assessment is not stored: it is
-- recomputed deterministically from the profile; only the "reviewed" marker is kept.
-- user_id has no foreign key yet: the auth tables do not exist until Better Auth is added, and a
-- later migration will add `REFERENCES auth."user"(id) ON DELETE CASCADE` to every user_id.
CREATE TABLE pulseform.user_profiles (
  user_id                 text PRIMARY KEY,
  primary_goal            text NOT NULL CHECK (primary_goal IN ('lose-fat', 'build-muscle', 'recomposition', 'get-stronger', 'improve-fitness')),
  date_of_birth           date NOT NULL,                       -- age is never stored; it is derived
  sex                     text NOT NULL CHECK (sex IN ('male', 'female', 'prefer-not-to-say')),
  height_cm               numeric(6, 2) NOT NULL CHECK (height_cm BETWEEN 50 AND 275),
  weight_kg               numeric(6, 2) NOT NULL CHECK (weight_kg BETWEEN 20 AND 500),
  unit_system             text NOT NULL CHECK (unit_system IN ('metric', 'imperial')),   -- display only; stored values are metric
  training_experience     text NOT NULL CHECK (training_experience IN ('beginner', 'intermediate', 'advanced')),
  training_days_per_week  smallint NOT NULL CHECK (training_days_per_week BETWEEN 2 AND 6),
  training_location       text NOT NULL CHECK (training_location IN ('gym', 'home', 'both')),
  equipment               text[] NOT NULL DEFAULT '{}'
                          CHECK (equipment <@ ARRAY['full-gym', 'dumbbells', 'barbells', 'cable-machine', 'machines', 'resistance-bands', 'pull-up-bar', 'bench', 'bodyweight-only', 'other']::text[]),
  activity_level          text NOT NULL CHECK (activity_level IN ('sedentary', 'lightly-active', 'moderately-active', 'very-active')),
  target_weight_kg        numeric(6, 2) CHECK (target_weight_kg BETWEEN 20 AND 500),
  -- Calorie Check-in result, set only when the user confirms one: all four or none.
  energy_maintenance_kcal integer CHECK (energy_maintenance_kcal BETWEEN 1000 AND 6000),
  energy_observed_from    date,
  energy_observed_to      date,
  energy_accepted_at      timestamptz,
  CONSTRAINT energy_calibration_all_or_none CHECK (
    (energy_maintenance_kcal IS NULL AND energy_observed_from IS NULL AND energy_observed_to IS NULL AND energy_accepted_at IS NULL)
    OR (energy_maintenance_kcal IS NOT NULL AND energy_observed_from IS NOT NULL AND energy_observed_to IS NOT NULL AND energy_accepted_at IS NOT NULL)
  ),
  -- The profile `updated_at` whose assessment the user has reviewed (null: not yet reviewed).
  assessment_reviewed_for timestamptz,
  schema_version          smallint NOT NULL DEFAULT 2,         -- the app's stored-profile version
  created_at              timestamptz NOT NULL DEFAULT now(),  -- row creation on the server
  updated_at              timestamptz NOT NULL                 -- the profile's own updatedAt, as sent by the app
);

-- How the app addresses the user, and per-user settings. The avatar image is NOT stored here:
-- only the key of a private Cloudflare R2 object (a later phase), never bytes or a data URL.
CREATE TABLE pulseform.user_preferences (
  user_id            text PRIMARY KEY,
  display_name       text CHECK (char_length(display_name) BETWEEN 1 AND 40),
  avatar_object_key  text CHECK (char_length(avatar_object_key) BETWEEN 1 AND 512),
  theme_preference   text NOT NULL DEFAULT 'system' CHECK (theme_preference IN ('system', 'light', 'dark')),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
