-- ===========================================================
-- 021_tracked_cities.sql
-- Adds users.tracked_cities for the time meeting finder.
-- Structure: array of {city_id, wake_start, wake_end} objects.
-- Default: empty array.
-- ===========================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tracked_cities JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS users_tracked_cities_gin ON users USING GIN (tracked_cities);
