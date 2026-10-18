-- Workout plans: the generated plan is a deterministic, versioned snapshot of the workout
-- engine's output, validated by the app's strict parser. It is stored whole (jsonb) with its
-- key facts as columns, not exploded into tables: nothing queries inside it, and history never
-- depends on it (a performed workout snapshots its own exercises, see workout_logs).
-- The plan id is a hash of its inputs, so two users can hold the same id: ids are unique per user.
CREATE TABLE stokeform.workout_plans (
  user_id                      text NOT NULL,
  id                           text NOT NULL,
  workout_programming_version  text NOT NULL CHECK (workout_programming_version IN ('v2')),
  generated_at                 date NOT NULL,
  goal                         text NOT NULL CHECK (goal IN ('lose-fat', 'build-muscle', 'recomposition', 'get-stronger', 'improve-fitness')),
  experience                   text NOT NULL CHECK (experience IN ('beginner', 'intermediate', 'advanced')),
  days_per_week                smallint NOT NULL CHECK (days_per_week BETWEEN 2 AND 6),
  program_style                text NOT NULL CHECK (program_style IN ('hypertrophy', 'strength', 'general')),
  plan                         jsonb NOT NULL CHECK (jsonb_typeof(plan) = 'object'),
  is_current                   boolean NOT NULL DEFAULT false,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
-- At most one current plan per user (older plans may be kept).
CREATE UNIQUE INDEX workout_plans_one_current ON stokeform.workout_plans (user_id) WHERE is_current;

-- A performed workout (domain: WorkoutLog). Independent of the plan afterwards. plan_id and
-- session_id record where it came from but are not foreign keys: the plan may be regenerated
-- or removed and the history must remain.
CREATE TABLE stokeform.workout_logs (
  user_id                      text NOT NULL,
  id                           text NOT NULL,
  plan_id                      text NOT NULL,
  workout_programming_version  text NOT NULL CHECK (workout_programming_version IN ('v2')),
  session_id                   text NOT NULL,
  session_type                 text NOT NULL CHECK (session_type IN ('full-body', 'upper', 'lower', 'push', 'pull', 'legs')),
  variant                      text,
  weight_unit                  text NOT NULL CHECK (weight_unit IN ('kg', 'lb')),   -- kg and lb are never added together
  started_at                   timestamptz NOT NULL,
  completed_at                 timestamptz,
  status                       text NOT NULL CHECK (status IN ('in-progress', 'completed')),
  current_exercise_index       integer NOT NULL DEFAULT 0 CHECK (current_exercise_index >= 0),
  PRIMARY KEY (user_id, id),
  CONSTRAINT completed_iff_finished CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
-- One workout in progress at a time (the app resumes it).
CREATE UNIQUE INDEX workout_logs_one_in_progress ON stokeform.workout_logs (user_id) WHERE status = 'in-progress';
CREATE INDEX workout_logs_history ON stokeform.workout_logs (user_id, completed_at DESC) WHERE status = 'completed';

CREATE TABLE stokeform.workout_log_exercises (
  user_id          text NOT NULL,
  log_id           text NOT NULL,
  position         integer NOT NULL CHECK (position >= 1),          -- the exercise's order
  exercise_id      text NOT NULL,                                    -- catalogue key (a code constant), not a table
  name             text NOT NULL CHECK (char_length(name) > 0),
  logging_mode     text NOT NULL CHECK (logging_mode IN ('weight-reps', 'reps', 'duration')),
  planned_sets     integer NOT NULL CHECK (planned_sets >= 1),
  target_kind      text NOT NULL CHECK (target_kind IN ('reps', 'time')),
  target_min_reps  integer CHECK (target_min_reps >= 1),
  target_max_reps  integer CHECK (target_max_reps >= 1),
  target_seconds   integer CHECK (target_seconds >= 1),
  rest_seconds     integer NOT NULL CHECK (rest_seconds >= 0),
  per_side         boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, log_id, position),
  FOREIGN KEY (user_id, log_id) REFERENCES stokeform.workout_logs (user_id, id) ON DELETE CASCADE,
  CONSTRAINT target_matches_kind CHECK (
    (target_kind = 'reps' AND target_min_reps IS NOT NULL AND target_max_reps IS NOT NULL AND target_seconds IS NULL)
    OR (target_kind = 'time' AND target_seconds IS NOT NULL AND target_min_reps IS NULL AND target_max_reps IS NULL)
  )
);

CREATE TABLE stokeform.workout_log_sets (
  user_id            text NOT NULL,
  log_id             text NOT NULL,
  exercise_position  integer NOT NULL,
  set_number         integer NOT NULL CHECK (set_number >= 1),
  status             text NOT NULL CHECK (status IN ('pending', 'completed', 'skipped')),
  weight             numeric(7, 2) CHECK (weight BETWEEN 0 AND 1000),   -- in the workout's weight_unit
  reps               integer CHECK (reps BETWEEN 1 AND 500),
  duration_seconds   integer CHECK (duration_seconds BETWEEN 1 AND 7200),
  completed_at       timestamptz,
  PRIMARY KEY (user_id, log_id, exercise_position, set_number),
  FOREIGN KEY (user_id, log_id, exercise_position)
    REFERENCES stokeform.workout_log_exercises (user_id, log_id, position) ON DELETE CASCADE,
  -- Set status is explicit: values and a completion time exist only on completed sets.
  CONSTRAINT values_only_when_completed CHECK (
    CASE WHEN status = 'completed'
      THEN completed_at IS NOT NULL AND (weight IS NOT NULL OR reps IS NOT NULL OR duration_seconds IS NOT NULL)
      ELSE completed_at IS NULL AND weight IS NULL AND reps IS NULL AND duration_seconds IS NULL
    END
  )
);
