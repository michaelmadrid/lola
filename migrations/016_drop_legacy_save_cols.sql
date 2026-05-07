-- ===========================================================
-- 016_drop_legacy_save_cols.sql
-- Drop saves.city_id and saves.trip_id.
-- Reasoning:
--   * city_id was the v0.3 single-attach pattern. Architecture moved to
--     save_cities (many-to-many join) for AI-detected multi-city captures.
--   * trip_id was auto-set from active-trip lookup but never used for
--     anything. Cities are the bucket; trip association is derived
--     by date overlap with trip date ranges if needed.
-- ===========================================================

-- Drop legacy columns. Data was already moot (city_id null for AI-tagged
-- saves; trip_id auto-set but unused).
ALTER TABLE saves DROP COLUMN IF EXISTS city_id;
ALTER TABLE saves DROP COLUMN IF EXISTS trip_id;
