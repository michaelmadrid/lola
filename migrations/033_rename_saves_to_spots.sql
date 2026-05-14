-- ===========================================================
-- 033_rename_saves_to_spots.sql
--
-- The big one. Renames the `saves` table to `spots` and updates
-- all dependent identifiers (indexes, constraints, FK columns)
-- to match.
--
-- Also renames guide_section_items.save_id → spot_id. Postgres
-- auto-rewrites the FK target table when the parent is renamed,
-- but does NOT rename the dependent column itself. Without this
-- rename, the column would still be called save_id pointing at
-- spots — confusing forever.
--
-- Idempotent: each block checks existence before acting.
-- ===========================================================

-- 1. Rename the table
ALTER TABLE IF EXISTS saves RENAME TO spots;

-- 2. Rename primary key constraint (Postgres doesn't auto-rename these)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saves_pkey') THEN
    ALTER TABLE spots RENAME CONSTRAINT saves_pkey TO spots_pkey;
  END IF;
END $$;

-- 3. Rename indexes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'saves_place_name_idx') THEN
    ALTER INDEX saves_place_name_idx RENAME TO spots_place_name_idx;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'saves_category_idx') THEN
    ALTER INDEX saves_category_idx RENAME TO spots_category_idx;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'saves_neighborhood_idx') THEN
    ALTER INDEX saves_neighborhood_idx RENAME TO spots_neighborhood_idx;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'saves_been_idx') THEN
    ALTER INDEX saves_been_idx RENAME TO spots_been_idx;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'saves_google_place_id_idx') THEN
    ALTER INDEX saves_google_place_id_idx RENAME TO spots_google_place_id_idx;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'saves_google_lookup_status_idx') THEN
    ALTER INDEX saves_google_lookup_status_idx RENAME TO spots_google_lookup_status_idx;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'saves_city_id_idx') THEN
    ALTER INDEX saves_city_id_idx RENAME TO spots_city_id_idx;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'saves_place_id_idx') THEN
    ALTER INDEX saves_place_id_idx RENAME TO spots_place_id_idx;
  END IF;
END $$;

-- 4. Rename FK constraints on the spots table itself
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saves_user_id_fkey') THEN
    ALTER TABLE spots RENAME CONSTRAINT saves_user_id_fkey TO spots_user_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saves_city_id_fkey') THEN
    ALTER TABLE spots RENAME CONSTRAINT saves_city_id_fkey TO spots_city_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saves_place_id_fkey') THEN
    ALTER TABLE spots RENAME CONSTRAINT saves_place_id_fkey TO spots_place_id_fkey;
  END IF;
END $$;

-- 5. Rename guide_section_items.save_id → spot_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'guide_section_items' AND column_name = 'save_id'
  ) THEN
    ALTER TABLE guide_section_items RENAME COLUMN save_id TO spot_id;
  END IF;
END $$;

-- 6. Rename the FK on guide_section_items that points at spots
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'guide_section_items'::regclass
       AND conname = 'guide_section_items_save_id_fkey'
  ) THEN
    ALTER TABLE guide_section_items
      RENAME CONSTRAINT guide_section_items_save_id_fkey TO guide_section_items_spot_id_fkey;
  END IF;
END $$;

-- 7. Rename any indexes on guide_section_items.save_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'guide_section_items_save_id_idx') THEN
    ALTER INDEX guide_section_items_save_id_idx RENAME TO guide_section_items_spot_id_idx;
  END IF;
END $$;

-- Sanity check after running:
--   \d spots                           -- expect to exist
--   \dt saves                          -- expect "Did not find any relation"
--   \d guide_section_items             -- expect spot_id column with FK to spots(id)
--   SELECT COUNT(*) FROM spots;        -- expect same count as old saves
