-- ===========================================================
-- 022_saves_been.sql
-- Adds saves.been boolean to distinguish places you've been from
-- places you want to go. Default true (most captures are post-visit).
-- ===========================================================

ALTER TABLE saves
  ADD COLUMN IF NOT EXISTS been BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS saves_been_idx ON saves (been);
