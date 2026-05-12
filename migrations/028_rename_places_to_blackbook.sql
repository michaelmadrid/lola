-- ===========================================================
-- 028_rename_places_to_blackbook.sql
--
-- Renames the `places` table to `blackbook`.
--
-- Why: the existing `places` table holds curated/admin-managed entries
-- (bookshops, galleries, etc) — kit's editorial "blackbook" of vetted
-- spots. The user-facing surface and the JS file have always called it
-- Blackbook; the DB and route name were the only outliers. This aligns
-- all three layers (table / route / UI) on one name.
--
-- This rename also clears the `places` name for Job 2, which introduces
-- a new canonical `places` table holding Google-resolved real-world
-- locations attached to user spots.
--
-- Idempotent: safe to run twice. Uses DO blocks where needed because
-- ALTER TABLE ... RENAME is not natively IF EXISTS-friendly across
-- all Postgres versions for indexes.
-- ===========================================================

-- Rename the table itself
ALTER TABLE IF EXISTS places RENAME TO blackbook;

-- Rename PK constraint (Postgres auto-renames the index that backs the PK
-- when the constraint is renamed, but the constraint name doesn't follow
-- the table rename automatically).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_pkey') THEN
    ALTER TABLE blackbook RENAME CONSTRAINT places_pkey TO blackbook_pkey;
  END IF;
END $$;

-- Rename any indexes that carry the old table name in their identifier.
-- Adjust the list below if you find more index names; the DO block is safe
-- to extend.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'places_city_id_idx') THEN
    ALTER INDEX places_city_id_idx RENAME TO blackbook_city_id_idx;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'places_slug_idx') THEN
    ALTER INDEX places_slug_idx RENAME TO blackbook_slug_idx;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'places_is_public_idx') THEN
    ALTER INDEX places_is_public_idx RENAME TO blackbook_is_public_idx;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'places_category_idx') THEN
    ALTER INDEX places_category_idx RENAME TO blackbook_category_idx;
  END IF;
END $$;

-- Rename FK constraints that referenced the old name
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_city_id_fkey') THEN
    ALTER TABLE blackbook RENAME CONSTRAINT places_city_id_fkey TO blackbook_city_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_created_by_fkey') THEN
    ALTER TABLE blackbook RENAME CONSTRAINT places_created_by_fkey TO blackbook_created_by_fkey;
  END IF;
END $$;

-- Sanity check after running this migration:
--   SELECT COUNT(*) FROM blackbook;
--   \d blackbook
--   (verify index + constraint names look clean)
