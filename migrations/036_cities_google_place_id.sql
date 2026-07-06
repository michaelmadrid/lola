-- 036_cities_google_place_id.sql
-- Store the Google Place ID on curated cities so admin resolves are traceable
-- and re-lookups are possible. Nullable — manual cities may not have one.

ALTER TABLE cities ADD COLUMN IF NOT EXISTS google_place_id TEXT;
CREATE INDEX IF NOT EXISTS cities_google_place_id_idx ON cities(google_place_id);
