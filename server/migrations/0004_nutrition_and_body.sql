-- Food (domain: FoodEntry). Nutrition values are what the user recorded for quantity, not per 100 g.
-- Daily totals are always derived, never stored.
CREATE TABLE pulseform.food_entries (
  user_id             text NOT NULL,
  id                  text NOT NULL,
  date                date NOT NULL,                              -- the user's local calendar day
  meal                text NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snacks')),
  name                text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  quantity            numeric(7, 2) NOT NULL CHECK (quantity > 0 AND quantity <= 10000),
  unit                text NOT NULL CHECK (unit IN ('g', 'ml', 'serving', 'piece')),
  calories            numeric(7, 1) NOT NULL CHECK (calories BETWEEN 0 AND 10000),
  protein_grams       numeric(6, 1) NOT NULL CHECK (protein_grams BETWEEN 0 AND 1000),
  carbohydrate_grams  numeric(6, 1) NOT NULL CHECK (carbohydrate_grams BETWEEN 0 AND 1000),
  fat_grams           numeric(6, 1) NOT NULL CHECK (fat_grams BETWEEN 0 AND 1000),
  created_at          timestamptz NOT NULL,
  updated_at          timestamptz NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX food_entries_by_day ON pulseform.food_entries (user_id, date, meal);

-- Body weight history (domain: WeightEntry). Same-day entries are kept, never averaged.
-- Stored in kilograms; the unit system is a display preference.
CREATE TABLE pulseform.weight_entries (
  user_id     text NOT NULL,
  id          text NOT NULL,
  date        date NOT NULL,
  weight_kg   numeric(6, 2) NOT NULL CHECK (weight_kg BETWEEN 20 AND 500),
  created_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX weight_entries_by_day ON pulseform.weight_entries (user_id, date, created_at);

-- Tape measurements (domain: MeasurementEntry): a session with any non-empty subset of sites.
-- "Non-empty" is enforced by the app (a session without values is refused there); the value rows
-- cascade with their session. Stored in centimetres.
CREATE TABLE pulseform.measurement_entries (
  user_id     text NOT NULL,
  id          text NOT NULL,
  date        date NOT NULL,
  created_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX measurement_entries_by_day ON pulseform.measurement_entries (user_id, date, created_at);

CREATE TABLE pulseform.measurement_values (
  user_id      text NOT NULL,
  entry_id     text NOT NULL,
  site         text NOT NULL CHECK (site IN ('waist', 'chest', 'hips', 'arm', 'thigh')),
  centimeters  numeric(6, 2) NOT NULL CHECK (centimeters BETWEEN 10 AND 300),
  PRIMARY KEY (user_id, entry_id, site),
  FOREIGN KEY (user_id, entry_id) REFERENCES pulseform.measurement_entries (user_id, id) ON DELETE CASCADE
);

-- InBody / body composition assessments (domain: BodyCompositionAssessment). The report image and
-- the raw extraction are NOT stored: they exist in memory only, and a later phase may keep the
-- image in private Cloudflare R2 (never here). Only values the user saved become rows.
CREATE TABLE pulseform.body_composition_assessments (
  user_id          text NOT NULL,
  id               text NOT NULL,
  date             date NOT NULL,
  source_device    text NOT NULL DEFAULT 'inbody' CHECK (source_device = 'inbody'),
  entry_method     text NOT NULL CHECK (entry_method IN ('manual', 'import')),
  import_format    text,                                          -- provenance, imports only
  parser_name      text,
  parser_version   text,
  created_at       timestamptz NOT NULL,
  updated_at       timestamptz NOT NULL,
  PRIMARY KEY (user_id, id),
  -- A manual entry carries no provenance; an import carries all of it.
  CONSTRAINT provenance_matches_method CHECK (
    (entry_method = 'manual' AND import_format IS NULL AND parser_name IS NULL AND parser_version IS NULL)
    OR (entry_method = 'import' AND import_format IS NOT NULL AND parser_name IS NOT NULL AND parser_version IS NOT NULL)
  )
);
CREATE INDEX body_composition_by_day ON pulseform.body_composition_assessments (user_id, date, created_at);

-- Values exactly as reported, with their unit (no conversion, no rounding), hence plain numeric.
-- The metric fixes the allowed unit (the domain's quantity kinds).
CREATE TABLE pulseform.body_composition_values (
  user_id        text NOT NULL,
  assessment_id  text NOT NULL,
  metric         text NOT NULL CHECK (metric IN (
    'weight', 'body-fat-mass', 'lean-body-mass', 'body-fat-percentage', 'skeletal-muscle-mass', 'fat-free-mass',
    'soft-lean-mass', 'bmi', 'visceral-fat-level', 'basal-metabolic-rate', 'total-body-water', 'intracellular-water',
    'extracellular-water', 'ecw-ratio', 'protein', 'minerals', 'bone-mineral-content', 'body-cell-mass', 'smi',
    'phase-angle', 'waist-hip-ratio', 'obesity-degree')),
  value          numeric NOT NULL,
  unit           text NOT NULL CHECK (unit IN ('kg', 'lb', '%', 'L', 'kg/m²', 'kcal', '°', 'none')),
  PRIMARY KEY (user_id, assessment_id, metric),
  FOREIGN KEY (user_id, assessment_id) REFERENCES pulseform.body_composition_assessments (user_id, id) ON DELETE CASCADE,
  CONSTRAINT unit_fits_metric CHECK (
    CASE
      WHEN metric IN ('weight', 'body-fat-mass', 'lean-body-mass', 'skeletal-muscle-mass', 'fat-free-mass', 'soft-lean-mass',
                      'protein', 'minerals', 'bone-mineral-content', 'body-cell-mass') THEN unit IN ('kg', 'lb')
      WHEN metric IN ('body-fat-percentage', 'obesity-degree') THEN unit = '%'
      WHEN metric IN ('total-body-water', 'intracellular-water', 'extracellular-water') THEN unit = 'L'
      WHEN metric IN ('bmi', 'smi') THEN unit = 'kg/m²'
      WHEN metric = 'basal-metabolic-rate' THEN unit = 'kcal'
      WHEN metric = 'phase-angle' THEN unit = '°'
      ELSE unit = 'none'                                         -- ecw-ratio, waist-hip-ratio, visceral-fat-level
    END
  )
);
