-- ===========================================================
-- 029_new_places_table.sql
--
-- Creates the new canonical `places` table for Google-resolved
-- real-world locations. Empty at first — Jobs 3 and 4 (lookup +
-- resolver) populate it. Job 5 wires it into the capture pipeline
-- via saves.place_id FK.
--
-- DO NOT confuse this with the old `places` table — that was
-- renamed to `blackbook` in migration 028. This is the new
-- canonical-locations table.
--
-- Idempotent: safe to run twice.
-- ===========================================================

CREATE TABLE IF NOT EXISTS places (
  id                  SERIAL PRIMARY KEY,
  google_place_id     TEXT UNIQUE NOT NULL,
  name                TEXT NOT NULL,
  address             TEXT,
  lat                 NUMERIC(10, 7),
  lng                 NUMERIC(10, 7),
  primary_type        TEXT,                              -- snake_case from Google ("hamburger_restaurant")
  primary_type_label  TEXT,                              -- title-cased for search ("Hamburger Restaurant")
  city_id             INT REFERENCES cities(id) ON DELETE SET NULL,
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes:
-- 1. city_id for "all places in city X" lookups (will be hot once Job 5 ships)
-- 2. primary_type for category-style filters
-- 3. primary_type_label for search (text match against title-cased label)
CREATE INDEX IF NOT EXISTS places_city_id_idx          ON places(city_id);
CREATE INDEX IF NOT EXISTS places_primary_type_idx     ON places(primary_type);
CREATE INDEX IF NOT EXISTS places_primary_type_label_idx ON places(primary_type_label);

-- Sanity check after running:
--   SELECT COUNT(*) FROM places;     -- expect 0
--   \d places                         -- inspect structure
