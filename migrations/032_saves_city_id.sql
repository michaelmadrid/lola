-- ===========================================================
-- 032_saves_city_id.sql
--
-- Collapses the save_cities many-to-many join table into a
-- single saves.city_id FK column.
--
-- Original intent of the join (migration 011) was to support
-- a save being attached to multiple cities — anticipated for
-- the era when neighborhoods were modeled as cities. Migration
-- 018 retired that idea (Bali villages demoted to saves.neighborhood
-- string), and in current code/data every save has exactly 0 or 1
-- attached city.
--
-- This migration:
--   1. Adds saves.city_id INT FK to cities(id) ON DELETE SET NULL
--   2. Backfills city_id from save_cities (first city per save)
--   3. Adds index on saves.city_id
--   4. Drops save_cities table
--
-- Idempotent (safe to re-run): each step checks IF EXISTS / IF NOT EXISTS
-- where possible. The DROP TABLE at the end uses IF EXISTS so re-runs
-- after success are no-ops.
-- ===========================================================

-- 1. Add city_id column
ALTER TABLE saves
  ADD COLUMN IF NOT EXISTS city_id INT REFERENCES cities(id) ON DELETE SET NULL;

-- 2. Backfill from join table. The LIMIT 1 in the subquery is defensive —
--    in practice every save has 0 or 1 row in save_cities, but the LIMIT
--    guarantees a single value either way. Only update rows that are still null
--    (lets the migration be re-run safely after partial completion).
UPDATE saves s
   SET city_id = (
     SELECT city_id FROM save_cities
      WHERE save_id = s.id
      LIMIT 1
   )
 WHERE s.city_id IS NULL;

-- 3. Index
CREATE INDEX IF NOT EXISTS saves_city_id_idx ON saves(city_id);

-- 4. Verify (manual): the count of saves that had a join row should match
--    the count that now have city_id. Run this in psql before continuing
--    if you want extra confidence:
--
--    SELECT
--      (SELECT COUNT(DISTINCT save_id) FROM save_cities) AS join_count,
--      (SELECT COUNT(*) FROM saves WHERE city_id IS NOT NULL) AS direct_count;
--
--    If join_count == direct_count, we're safe to drop the join table.

-- 5. Drop the join table. IF EXISTS so re-run is a no-op.
DROP TABLE IF EXISTS save_cities;

-- Sanity check after running:
--   \d saves       (should show city_id column with FK to cities)
--   \dt save_cities (should error: relation does not exist)
--   SELECT COUNT(*) FROM saves WHERE city_id IS NOT NULL;
