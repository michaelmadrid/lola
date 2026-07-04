-- ===========================================================
-- 034_spots_curation.sql
--
-- Adds Summer Holiday curation fields to the spots table.
-- Curated spots power index.summer-holiday.com.
--
-- New columns:
--   curated          BOOLEAN  — Summer Holiday official flag
--   curated_by       INT      — user id who curated it (admin)
--   curated_category TEXT     — flexible type: bookstore, film_lab, coffee, etc.
--   website          TEXT     — store/place website URL
--   image_url        TEXT     — hero image for index display
--
-- Idempotent: uses ADD COLUMN IF NOT EXISTS throughout.
-- ===========================================================

ALTER TABLE spots ADD COLUMN IF NOT EXISTS curated BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE spots ADD COLUMN IF NOT EXISTS curated_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE spots ADD COLUMN IF NOT EXISTS curated_category TEXT;
ALTER TABLE spots ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE spots ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE INDEX IF NOT EXISTS spots_curated_idx ON spots(curated) WHERE curated = true;
CREATE INDEX IF NOT EXISTS spots_curated_category_idx ON spots(curated_category);

-- Sanity check after running:
--   \d spots   (should show all 5 new columns)
--   SELECT COUNT(*) FROM spots WHERE curated = true;  (expect 0 until admin adds some)
