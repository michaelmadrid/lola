-- ===========================================================
-- 014_saves_ai_parse.sql
-- AI-parsed structured fields on saves.
-- text column is never overwritten — original capture preserved.
-- All new columns nullable; populated when AI parse succeeds.
-- ===========================================================

ALTER TABLE saves
  ADD COLUMN IF NOT EXISTS place_name      TEXT,
  ADD COLUMN IF NOT EXISTS category        TEXT,
  ADD COLUMN IF NOT EXISTS tip             TEXT,
  ADD COLUMN IF NOT EXISTS country         TEXT,
  ADD COLUMN IF NOT EXISTS ai_parsed_at    TIMESTAMP,
  ADD COLUMN IF NOT EXISTS ai_parse_error  TEXT;

CREATE INDEX IF NOT EXISTS saves_place_name_idx ON saves(place_name) WHERE place_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS saves_category_idx   ON saves(category) WHERE category IS NOT NULL;
