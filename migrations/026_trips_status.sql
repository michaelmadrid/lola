-- ===========================================================
-- 026_trips_status.sql
--
-- Adds publish state to trips, parallel to guides:
--   status = 'draft' | 'published' | 'archived'
-- A published trip is accessible at /t/:slug (no auth).
--
-- Trips already have a `slug` column from migration 003. The slug is
-- generated lazily — only on first publish — using the trip's name.
-- Once set, the slug persists across unpublish/republish so URLs
-- shared in the wild keep working.
-- ===========================================================

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS published_at  TIMESTAMPTZ;

-- Index for public lookups by slug (only published trips matter)
CREATE INDEX IF NOT EXISTS trips_published_slug_idx
  ON trips (slug)
  WHERE status = 'published';
