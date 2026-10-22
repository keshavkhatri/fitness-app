import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { migrateUp } from '../src/db/migrations';
import { loadMigrations } from '../tools/migration-files';
import { MIGRATIONS_DIRECTORY, failure, newDatabase, sqlClient } from './pglite';

/** The real migrations on a real PostgreSQL engine (PGlite): the constraints are the domain rules, so they are tested as rules. */
const OWNERS = ['u-bc', 'u-cal-full', 'u-cal-low', 'u-cal-partial', 'u-ci', 'u-del-a', 'u-del-b', 'u-ex', 'u-food', 'u-log', 'u-log-other', 'u-m', 'u-n', 'u-n-other', 'u-plan-a', 'u-plan-b', 'u-plan-c', 'u-plan-d', 'u-pref', 'u-pref-bad', 'u-pref-default', 'u-pref-long', 'u-profile', 'u-profile-2', 'u-set', 'u-w', 'u-w-other'];
let db: PGlite;
beforeAll(async () => {
  db = await newDatabase();
  await migrateUp(sqlClient(db), await loadMigrations(MIGRATIONS_DIRECTORY));
  // Owners must exist since 0007 (user_id references auth."user"): one account per test user.
  for (const id of OWNERS) {
    await db.query('INSERT INTO auth."user" (id, name, email, "emailVerified") VALUES ($1, $1, $2, false)', [id, `${id}@example.test`]);
  }
}, 60_000);

const T = '2026-10-15T08:00:00.000Z';
const run = (sql: string, values: unknown[] = []) => db.query(sql, values);
const count = async (sql: string, values: unknown[] = []) => Number((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`, values)).rows[0].n);

const profile = (user: string, overrides: Record<string, unknown> = {}) => {
  const p = {
    user_id: user, primary_goal: 'build-muscle', date_of_birth: '1992-04-12', sex: 'male', height_cm: 178, weight_kg: 79.5, unit_system: 'metric',
    training_experience: 'intermediate', training_days_per_week: 4, training_location: 'gym', equipment: ['full-gym'], activity_level: 'moderately-active',
    updated_at: T, ...overrides,
  };
  const keys = Object.keys(p);
  return failure(db, `INSERT INTO stokeform.user_profiles (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(p));
};

describe('structure', () => {
  it('keeps Better Auth in its own schema: exactly its four tables, which stokeform references but never extends', async () => {
    const authTables = (await run("SELECT table_name FROM information_schema.tables WHERE table_schema = 'auth' ORDER BY 1")).rows.map((r) => (r as { table_name: string }).table_name);
    expect(authTables).toEqual(['account', 'session', 'user', 'verification']);
    expect(await count("information_schema.tables WHERE table_schema = 'public'")).toBe(0);
  });

  it('gives every root user-owned table a cascading key to the Better Auth user (0007)', async () => {
    const owned = (await run(
      `SELECT conrelid::regclass::text AS tbl FROM pg_constraint
       WHERE contype = 'f' AND confrelid = 'auth."user"'::regclass AND connamespace = 'stokeform'::regnamespace AND confdeltype = 'c' ORDER BY 1`,
    )).rows.map((r) => (r as { tbl: string }).tbl);
    expect(owned).toEqual([
      'stokeform.body_composition_assessments', 'stokeform.daily_check_ins', 'stokeform.food_entries', 'stokeform.measurement_entries',
      'stokeform.notification_reads', 'stokeform.push_devices', 'stokeform.user_preferences', 'stokeform.user_profiles', 'stokeform.weight_entries',
      'stokeform.workout_logs', 'stokeform.workout_plans',
    ]);
  });

  it('refuses data for a user that does not exist, and deletes a user with all their data', async () => {
    expect(await failure(db, "INSERT INTO stokeform.weight_entries (user_id, id, date, weight_kg, created_at, updated_at) VALUES ('nobody', 'w', '2026-10-15', 80, now(), now())")).toMatch(/foreign key/);
    await run('INSERT INTO auth."user" (id, name, email, "emailVerified") VALUES ($1, $1, $2, false)', ['u-gone', 'gone@example.test']);
    await run("INSERT INTO stokeform.measurement_entries (user_id, id, date, created_at, updated_at) VALUES ('u-gone', 'm1', '2026-10-15', now(), now())");
    await run("INSERT INTO stokeform.measurement_values (user_id, entry_id, site, centimeters) VALUES ('u-gone', 'm1', 'waist', 80)");
    await run('DELETE FROM auth."user" WHERE id = $1', ['u-gone']);
    expect(await count("stokeform.measurement_entries WHERE user_id = 'u-gone'")).toBe(0);
    expect(await count("stokeform.measurement_values WHERE user_id = 'u-gone'")).toBe(0);
  });

  it('puts every domain table in the stokeform schema, owned by a user_id that leads its primary key', async () => {
    const tables = (await run("SELECT table_name FROM information_schema.tables WHERE table_schema = 'stokeform' AND table_name <> 'schema_migrations' ORDER BY 1")).rows as { table_name: string }[];
    expect(tables.length).toBeGreaterThanOrEqual(14);
    for (const { table_name } of tables) {
      const first = (await run(
        `SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
         WHERE i.indrelid = ('stokeform.' || $1)::regclass AND i.indisprimary`, [table_name])).rows as { attname: string }[];
      expect(first[0]?.attname, table_name).toBe('user_id');
    }
  });

  it('stores no image or binary data anywhere: images belong in private object storage', async () => {
    expect(await count("information_schema.columns WHERE table_schema = 'stokeform' AND data_type = 'bytea'")).toBe(0);
    expect(await count("information_schema.columns WHERE table_schema = 'stokeform' AND column_name ~* '(photo|image|picture|data_url|blob|base64)'")).toBe(0);
    // The avatar is only a reference to an object.
    expect(await count("information_schema.columns WHERE table_schema = 'stokeform' AND column_name = 'avatar_object_key'")).toBe(1);
  });
});

describe('profile and preferences', () => {
  it('accepts a profile that the app model allows and holds one per user', async () => {
    expect(await profile('u-profile')).toBeNull();
    expect(await profile('u-profile')).toMatch(/duplicate key/);
    expect(await profile('u-profile-2', { target_weight_kg: 84, height_cm: 172.4 })).toBeNull();
  });

  it.each([
    ['an unknown goal', { primary_goal: 'bulk' }],
    ['7 training days (deliberately not offered)', { training_days_per_week: 7 }],
    ['an unknown equipment id', { equipment: ['full-gym', 'trampoline'] }],
    ['a height outside 50-275 cm', { height_cm: 300 }],
    ['a weight outside 20-500 kg', { weight_kg: 10 }],
    ['an unknown unit system', { unit_system: 'furlongs' }],
  ])('rejects %s', async (_, overrides) => {
    expect(await profile(`u-bad-${Math.random()}`, overrides)).toMatch(/violates check constraint/);
  });

  it('keeps the Calorie Check-in calibration all-or-nothing', async () => {
    expect(await profile('u-cal-partial', { energy_maintenance_kcal: 2700 })).toMatch(/energy_calibration_all_or_none/);
    expect(
      await profile('u-cal-full', { energy_maintenance_kcal: 2700, energy_observed_from: '2026-09-01', energy_observed_to: '2026-09-28', energy_accepted_at: T }),
    ).toBeNull();
    expect(await profile('u-cal-low', { energy_maintenance_kcal: 500, energy_observed_from: '2026-09-01', energy_observed_to: '2026-09-28', energy_accepted_at: T })).toMatch(/violates check/);
  });

  it('holds preferences per user with a known theme and a short display name', async () => {
    expect(await failure(db, "INSERT INTO stokeform.user_preferences (user_id, display_name, theme_preference) VALUES ('u-pref', 'Keshav', 'dark')")).toBeNull();
    expect(await failure(db, "INSERT INTO stokeform.user_preferences (user_id) VALUES ('u-pref-default')")).toBeNull();
    expect((await run("SELECT theme_preference FROM stokeform.user_preferences WHERE user_id = 'u-pref-default'")).rows).toEqual([{ theme_preference: 'system' }]);
    expect(await failure(db, "INSERT INTO stokeform.user_preferences (user_id, theme_preference) VALUES ('u-pref-bad', 'sepia')")).toMatch(/violates check/);
    expect(await failure(db, 'INSERT INTO stokeform.user_preferences (user_id, display_name) VALUES ($1, $2)', ['u-pref-long', 'x'.repeat(41)])).toMatch(/violates check/);
  });
});

describe('workout plans', () => {
  const plan = (user: string, id: string, current: boolean) =>
    failure(
      db,
      `INSERT INTO stokeform.workout_plans (user_id, id, workout_programming_version, generated_at, goal, experience, days_per_week, program_style, plan, is_current)
       VALUES ($1, $2, 'v2', '2026-10-15', 'build-muscle', 'intermediate', 4, 'hypertrophy', '{"sessions": []}'::jsonb, $3)`,
      [user, id, current],
    );

  it('lets two users hold the same deterministic plan id, but not one user twice', async () => {
    expect(await plan('u-plan-a', 'wp-v2-67450114', true)).toBeNull();
    expect(await plan('u-plan-b', 'wp-v2-67450114', true)).toBeNull();
    expect(await plan('u-plan-a', 'wp-v2-67450114', false)).toMatch(/duplicate key/);
  });

  it('allows one current plan per user and any number of older ones', async () => {
    expect(await plan('u-plan-c', 'p1', true)).toBeNull();
    expect(await plan('u-plan-c', 'p2', true)).toMatch(/workout_plans_one_current/);
    expect(await plan('u-plan-c', 'p2', false)).toBeNull();
    expect(await plan('u-plan-c', 'p3', false)).toBeNull();
  });

  it('requires the stored plan to be a JSON object', async () => {
    expect(
      await failure(
        db,
        `INSERT INTO stokeform.workout_plans (user_id, id, workout_programming_version, generated_at, goal, experience, days_per_week, program_style, plan)
         VALUES ('u-plan-d', 'p', 'v2', '2026-10-15', 'build-muscle', 'beginner', 3, 'general', '[1]'::jsonb)`,
      ),
    ).toMatch(/violates check/);
  });
});

describe('workout logs', () => {
  const log = (user: string, id: string, status: 'in-progress' | 'completed', completedAt: string | null = status === 'completed' ? T : null) =>
    failure(
      db,
      `INSERT INTO stokeform.workout_logs (user_id, id, plan_id, workout_programming_version, session_id, session_type, variant, weight_unit, started_at, completed_at, status)
       VALUES ($1, $2, 'wp-v2-1', 'v2', 'day-1-push', 'push', 'A', 'kg', $3, $4, $5)`,
      [user, id, T, completedAt, status],
    );
  const exercise = (user: string, logId: string, position: number, kind: 'reps' | 'time' = 'reps') =>
    failure(
      db,
      `INSERT INTO stokeform.workout_log_exercises (user_id, log_id, position, exercise_id, name, logging_mode, planned_sets, target_kind, target_min_reps, target_max_reps, target_seconds, rest_seconds)
       VALUES ($1, $2, $3, 'barbell-bench-press', 'Bench Press', $4, 3, $5, $6, $7, $8, 120)`,
      [user, logId, position, kind === 'reps' ? 'weight-reps' : 'duration', kind, kind === 'reps' ? 6 : null, kind === 'reps' ? 10 : null, kind === 'time' ? 45 : null],
    );
  const set = (user: string, logId: string, position: number, n: number, status: string, values: { weight?: number; reps?: number; at?: string | null } = {}) =>
    failure(
      db,
      `INSERT INTO stokeform.workout_log_sets (user_id, log_id, exercise_position, set_number, status, weight, reps, completed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [user, logId, position, n, status, values.weight ?? null, values.reps ?? null, values.at ?? null],
    );

  it('ties a finished state to a completion time, and allows one workout in progress per user', async () => {
    expect(await log('u-log', 'wl-1', 'completed')).toBeNull();
    expect(await log('u-log', 'wl-2', 'completed', null)).toMatch(/completed_iff_finished/);
    expect(await log('u-log', 'wl-3', 'in-progress', T)).toMatch(/completed_iff_finished/);
    expect(await log('u-log', 'wl-4', 'in-progress')).toBeNull();
    expect(await log('u-log', 'wl-5', 'in-progress')).toMatch(/workout_logs_one_in_progress/);
    expect(await log('u-log-other', 'wl-5', 'in-progress')).toBeNull();
  });

  it('keeps targets consistent with their kind', async () => {
    await log('u-ex', 'wl-1', 'completed');
    expect(await exercise('u-ex', 'wl-1', 1, 'reps')).toBeNull();
    expect(await exercise('u-ex', 'wl-1', 2, 'time')).toBeNull();
    expect(
      await failure(db, `UPDATE stokeform.workout_log_exercises SET target_seconds = 30 WHERE user_id = 'u-ex' AND log_id = 'wl-1' AND position = 1`),
    ).toMatch(/target_matches_kind/);
    expect(await exercise('u-ex', 'wl-1', 0, 'reps')).toMatch(/violates check/);
    expect(await exercise('u-ex', 'wl-404', 1, 'reps')).toMatch(/foreign key/);
  });

  it('makes set status explicit: values and a time only on completed sets', async () => {
    await log('u-set', 'wl-1', 'completed');
    await exercise('u-set', 'wl-1', 1);
    expect(await set('u-set', 'wl-1', 1, 1, 'completed', { weight: 72.5, reps: 10, at: T })).toBeNull();
    expect(await set('u-set', 'wl-1', 1, 2, 'pending')).toBeNull();
    expect(await set('u-set', 'wl-1', 1, 3, 'skipped')).toBeNull();
    expect(await set('u-set', 'wl-1', 1, 4, 'completed', { at: T })).toMatch(/values_only_when_completed/); // no values
    expect(await set('u-set', 'wl-1', 1, 5, 'completed', { weight: 20, reps: 8 })).toMatch(/values_only_when_completed/); // no time
    expect(await set('u-set', 'wl-1', 1, 6, 'pending', { reps: 8 })).toMatch(/values_only_when_completed/);
    expect(await set('u-set', 'wl-1', 1, 7, 'skipped', { at: T })).toMatch(/values_only_when_completed/);
    expect(await set('u-set', 'wl-1', 1, 8, 'completed', { weight: 1001, reps: 5, at: T })).toMatch(/violates check/);
    expect(await set('u-set', 'wl-1', 1, 9, 'completed', { weight: 20, reps: 501, at: T })).toMatch(/violates check/);
    expect(await set('u-set', 'wl-1', 1, 1, 'pending')).toMatch(/duplicate key/);
  });

  it('removes a workout with its exercises and sets, and nothing of other users', async () => {
    for (const user of ['u-del-a', 'u-del-b']) {
      await log(user, 'wl-1', 'completed');
      await exercise(user, 'wl-1', 1);
      await set(user, 'wl-1', 1, 1, 'completed', { weight: 50, reps: 5, at: T });
    }
    await run("DELETE FROM stokeform.workout_logs WHERE user_id = 'u-del-a'");
    expect(await count("stokeform.workout_log_sets WHERE user_id = 'u-del-a'")).toBe(0);
    expect(await count("stokeform.workout_log_exercises WHERE user_id = 'u-del-a'")).toBe(0);
    expect(await count("stokeform.workout_log_sets WHERE user_id = 'u-del-b'")).toBe(1);
  });
});

describe('nutrition and body tracking', () => {
  const food = (id: string, overrides: Record<string, unknown> = {}) => {
    const f = { user_id: 'u-food', id, date: '2026-10-15', meal: 'lunch', name: 'Chicken rice bowl', quantity: 450, unit: 'g', calories: 780, protein_grams: 52, carbohydrate_grams: 88, fat_grams: 20, created_at: T, updated_at: T, ...overrides };
    const keys = Object.keys(f);
    return failure(db, `INSERT INTO stokeform.food_entries (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(f));
  };

  it('holds food entries within the domain limits', async () => {
    expect(await food('f1')).toBeNull();
    expect(await food('f1')).toMatch(/duplicate key/);
    expect(await food('f2', { meal: 'brunch' })).toMatch(/violates check/);
    expect(await food('f3', { name: 'x'.repeat(81) })).toMatch(/violates check/);
    expect(await food('f4', { quantity: 0 })).toMatch(/violates check/);
    expect(await food('f5', { calories: 10001 })).toMatch(/violates check/);
    expect(await food('f6', { protein_grams: -1 })).toMatch(/violates check/);
    expect(await food('f7', { unit: 'cup' })).toMatch(/violates check/);
    expect(await food('f8', { quantity: 0.5, unit: 'serving', calories: 0 })).toBeNull();
  });

  it('keeps several weigh-ins on one day, in range, per user', async () => {
    const weigh = (user: string, id: string, kg: number) =>
      failure(db, 'INSERT INTO stokeform.weight_entries (user_id, id, date, weight_kg, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)', [user, id, '2026-10-15', kg, T]);
    expect(await weigh('u-w', 'w1', 79.4)).toBeNull();
    expect(await weigh('u-w', 'w2', 79.9)).toBeNull();
    expect(await weigh('u-w', 'w3', 19.9)).toMatch(/violates check/);
    expect(await weigh('u-w', 'w4', 500.1)).toMatch(/violates check/);
    expect(await weigh('u-w-other', 'w1', 60)).toBeNull();
  });

  it('stores tape measurements per site, in range, removed with their session', async () => {
    await run("INSERT INTO stokeform.measurement_entries (user_id, id, date, created_at, updated_at) VALUES ('u-m', 'm1', '2026-10-15', $1, $1)", [T]);
    const value = (site: string, cm: number) => failure(db, "INSERT INTO stokeform.measurement_values (user_id, entry_id, site, centimeters) VALUES ('u-m', 'm1', $1, $2)", [site, cm]);
    expect(await value('waist', 84)).toBeNull();
    expect(await value('waist', 85)).toMatch(/duplicate key/);
    expect(await value('neck', 38)).toMatch(/violates check/);
    expect(await value('arm', 9.9)).toMatch(/violates check/);
    expect(await value('thigh', 300.1)).toMatch(/violates check/);
    await run("DELETE FROM stokeform.measurement_entries WHERE user_id = 'u-m'");
    expect(await count("stokeform.measurement_values WHERE user_id = 'u-m'")).toBe(0);
  });

  describe('body composition', () => {
    const assessment = (id: string, method: 'manual' | 'import', provenance: boolean) =>
      failure(
        db,
        `INSERT INTO stokeform.body_composition_assessments (user_id, id, date, entry_method, import_format, parser_name, parser_version, created_at, updated_at)
         VALUES ('u-bc', $1, '2026-10-01', $2, $3, $4, $5, $6, $6)`,
        [id, method, provenance ? 'inbody-extraction.v1' : null, provenance ? 'inbody-ai' : null, provenance ? '1' : null, T],
      );
    const metric = (assessmentId: string, name: string, value: number | string, unit: string) =>
      failure(db, "INSERT INTO stokeform.body_composition_values (user_id, assessment_id, metric, value, unit) VALUES ('u-bc', $1, $2, $3, $4)", [assessmentId, name, value, unit]);

    it('requires provenance for imports and forbids it for manual entries', async () => {
      expect(await assessment('a-manual', 'manual', false)).toBeNull();
      expect(await assessment('a-import', 'import', true)).toBeNull();
      expect(await assessment('a-bad-1', 'manual', true)).toMatch(/provenance_matches_method/);
      expect(await assessment('a-bad-2', 'import', false)).toMatch(/provenance_matches_method/);
    });

    it('fixes the unit each metric may use', async () => {
      expect(await metric('a-manual', 'weight', 94.5, 'kg')).toBeNull();
      expect(await metric('a-import', 'weight', 208.3, 'lb')).toBeNull();
      expect(await metric('a-manual', 'body-fat-percentage', 33.4, '%')).toBeNull();
      expect(await metric('a-manual', 'bmi', 29.2, 'kg/m²')).toBeNull();
      expect(await metric('a-manual', 'basal-metabolic-rate', 1729, 'kcal')).toBeNull();
      expect(await metric('a-manual', 'phase-angle', 6.4, '°')).toBeNull();
      expect(await metric('a-manual', 'ecw-ratio', 0.372, 'none')).toBeNull();
      expect(await metric('a-manual', 'visceral-fat-level', 15, 'none')).toBeNull();
      expect(await metric('a-manual', 'total-body-water', 46.1, 'L')).toBeNull();
      expect(await metric('a-manual', 'minerals', 4.26, 'kg')).toBeNull();
      expect(await metric('a-manual', 'skeletal-muscle-mass', 35.8, '%')).toMatch(/unit_fits_metric/);
      expect(await metric('a-manual', 'body-fat-percentage', 33.4, 'kg')).toMatch(/duplicate key|unit_fits_metric/);
      expect(await metric('a-import', 'bmi', 29.2, 'kg')).toMatch(/unit_fits_metric/);
      expect(await metric('a-import', 'ecw-ratio', 0.372, '%')).toMatch(/unit_fits_metric/);
      expect(await metric('a-import', 'height', 180, 'cm')).toMatch(/violates check/);
    });

    it('stores values exactly as reported (no rounding or conversion)', async () => {
      expect(await metric('a-import', 'body-fat-mass', '31.6', 'kg')).toBeNull();
      expect(await metric('a-import', 'smi', '8.50', 'kg/m²')).toBeNull();
      const { rows } = await run("SELECT metric, value::text AS value FROM stokeform.body_composition_values WHERE user_id = 'u-bc' AND assessment_id = 'a-import' AND metric IN ('body-fat-mass', 'smi') ORDER BY metric");
      expect(rows).toEqual([{ metric: 'body-fat-mass', value: '31.6' }, { metric: 'smi', value: '8.50' }]);
    });

    it('removes values with their assessment', async () => {
      await run("DELETE FROM stokeform.body_composition_assessments WHERE user_id = 'u-bc' AND id = 'a-manual'");
      expect(await count("stokeform.body_composition_values WHERE user_id = 'u-bc' AND assessment_id = 'a-manual'")).toBe(0);
      expect(await count("stokeform.body_composition_values WHERE user_id = 'u-bc' AND assessment_id = 'a-import'")).toBeGreaterThan(0);
    });
  });
});

describe('check-ins and notifications', () => {
  const checkIn = (day: string, steps: number | null, recovery: string | null) =>
    failure(db, "INSERT INTO stokeform.daily_check_ins (user_id, date, steps, recovery) VALUES ('u-ci', $1, $2, $3)", [day, steps, recovery]);

  it('holds one row per day with at least one self-reported value, within range', async () => {
    expect(await checkIn('2026-10-14', 8200, null)).toBeNull();
    expect(await checkIn('2026-10-15', null, 'good')).toBeNull();
    expect(await checkIn('2026-10-14', 9000, null)).toMatch(/duplicate key/);
    expect(await checkIn('2026-10-13', null, null)).toMatch(/has_a_value/);
    expect(await checkIn('2026-10-12', 100001, null)).toMatch(/violates check/);
    expect(await checkIn('2026-10-11', -1, null)).toMatch(/violates check/);
    expect(await checkIn('2026-10-10', null, 'amazing')).toMatch(/violates check/);
    // A new value for a day replaces the old one.
    await run("INSERT INTO stokeform.daily_check_ins (user_id, date, steps) VALUES ('u-ci', '2026-10-14', 9500) ON CONFLICT (user_id, date) DO UPDATE SET steps = EXCLUDED.steps");
    expect((await run("SELECT steps FROM stokeform.daily_check_ins WHERE user_id = 'u-ci' AND date = '2026-10-14'")).rows).toEqual([{ steps: 9500 }]);
  });

  it('remembers each read notification once per user', async () => {
    expect(await failure(db, "INSERT INTO stokeform.notification_reads (user_id, notification_id) VALUES ('u-n', 'planned:day-1-push:2026-10-15')")).toBeNull();
    expect(await failure(db, "INSERT INTO stokeform.notification_reads (user_id, notification_id) VALUES ('u-n', 'planned:day-1-push:2026-10-15')")).toMatch(/duplicate key/);
    expect(await failure(db, "INSERT INTO stokeform.notification_reads (user_id, notification_id) VALUES ('u-n-other', 'planned:day-1-push:2026-10-15')")).toBeNull();
    expect(await failure(db, "INSERT INTO stokeform.notification_reads (user_id, notification_id) VALUES ('u-n', '')")).toMatch(/violates check/);
  });
});
