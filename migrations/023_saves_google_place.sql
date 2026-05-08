-- ===========================================================
-- 023_saves_google_place.sql
--
-- Adds Google Places enrichment columns to the saves table.
-- This is SCHEMA-ONLY prep — no lookup logic ships with this migration.
--
-- Intent: at publish time (when building a guide), the app can run a Text Search
-- for any save lacking a google_place_id, store the result here, and later use
-- it to render maps / address / "permanently closed" badges in published guides.
--
-- Status field semantics:
--   NULL          → never attempted lookup. The default state. Most saves stay here.
--   'pending'     → queued for batch lookup
--   'matched'     → google_place_id is populated and verified
--   'no_match'    → lookup ran, no confident match found
--   'ambiguous'   → multiple candidates returned, needs manual review
-- ===========================================================

ALTER TABLE saves
  ADD COLUMN IF NOT EXISTS google_place_id      TEXT,
  ADD COLUMN IF NOT EXISTS google_lookup_status TEXT,
  ADD COLUMN IF NOT EXISTS google_lookup_at     TIMESTAMP;

-- Partial index: most saves will have NULL place_id, only index when populated.
-- Useful for "find this google_place_id across saves" queries when we publish guides.
CREATE INDEX IF NOT EXISTS saves_google_place_id_idx
  ON saves (google_place_id)
  WHERE google_place_id IS NOT NULL;

-- Optional: index lookup_status for batch queries like
-- "give me all saves where status = 'pending' to process".
CREATE INDEX IF NOT EXISTS saves_google_lookup_status_idx
  ON saves (google_lookup_status)
  WHERE google_lookup_status IS NOT NULL;
