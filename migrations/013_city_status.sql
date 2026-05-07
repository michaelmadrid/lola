-- ===========================================================
-- 013_city_status.sql
-- Cities now have a status integer:
--   1 = auto-created (from a capture, AI-detected)
--   2 = pending review (auto-created and flagged for review)
--   3 = featured (KIT/curator approved, shows in featured dropdowns)
-- ===========================================================

ALTER TABLE cities
  ADD COLUMN IF NOT EXISTS status INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS cities_status_idx ON cities(status);

-- Existing cities were all manually seeded by admin → mark as featured
UPDATE cities SET status = 3 WHERE status = 1;
