-- ===========================================================
-- 001_extend_cities.sql
-- Renames city_metadata → cities and adds columns we need.
-- Preserves existing data (2 rows).
-- ===========================================================

-- 1. Rename the table
ALTER TABLE city_metadata RENAME TO cities;
ALTER SEQUENCE city_metadata_id_seq RENAME TO cities_id_seq;
ALTER TABLE cities RENAME CONSTRAINT city_metadata_pkey TO cities_pkey;
ALTER TABLE cities RENAME CONSTRAINT city_metadata_name_key TO cities_name_key;

-- 2. Add the columns we need
ALTER TABLE cities ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
ALTER TABLE cities ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES cities(id) ON DELETE SET NULL;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS is_region BOOLEAN DEFAULT FALSE;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS lat DECIMAL(9,6);
ALTER TABLE cities ADD COLUMN IF NOT EXISTS lon DECIMAL(9,6);
ALTER TABLE cities ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE cities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- 3. Backfill slugs from existing names (lowercase, hyphens for spaces)
UPDATE cities SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g')) WHERE slug IS NULL;

-- 4. Make slug unique (allow nulls during transition, but new rows must be unique)
CREATE UNIQUE INDEX IF NOT EXISTS cities_slug_unique ON cities(slug) WHERE slug IS NOT NULL;

-- 5. Indexes for common lookups
CREATE INDEX IF NOT EXISTS cities_parent_id_idx ON cities(parent_id);
CREATE INDEX IF NOT EXISTS cities_country_idx ON cities(country);

-- Done. To verify:
-- SELECT id, name, country, slug, parent_id, is_region FROM cities;
