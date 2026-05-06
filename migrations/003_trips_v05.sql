-- ===========================================================
-- 003_trips_v05.sql
-- Extend existing trips table with date range and notes.
-- The v0.3 trips table stays; we just add columns.
-- ===========================================================

ALTER TABLE trips ADD COLUMN IF NOT EXISTS date_start DATE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS date_end DATE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Slug for shareable URLs later (e.g. /trips/europe-26)
CREATE UNIQUE INDEX IF NOT EXISTS trips_slug_unique ON trips(slug) WHERE slug IS NOT NULL;

-- For querying "what trip is active today?"
CREATE INDEX IF NOT EXISTS trips_date_range_idx ON trips(date_start, date_end);
