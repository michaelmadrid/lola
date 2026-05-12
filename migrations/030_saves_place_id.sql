-- ===========================================================
-- 030_saves_place_id.sql
--
-- Adds saves.place_id — FK to the new canonical places table
-- (created in migration 029). After this migration, the capture
-- pipeline (Job 5 code change in saves.js) populates place_id
-- in the background via the resolver. Existing rows have null
-- place_id until the backfill script runs (Job 6).
--
-- ON DELETE SET NULL: if a places row is ever deleted, the save
-- doesn't disappear — it just loses its canonical-place link.
-- The save's text, place_name, category, etc. are unaffected.
--
-- Idempotent: safe to run twice.
-- ===========================================================

ALTER TABLE saves
  ADD COLUMN IF NOT EXISTS place_id INT REFERENCES places(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS saves_place_id_idx ON saves(place_id);

-- Sanity check:
--   \d saves
--   -- should show place_id column with FK to places(id)
--   SELECT COUNT(*) FROM saves WHERE place_id IS NOT NULL;
--   -- should be 0 until Job 6 backfill runs (or new captures land)
