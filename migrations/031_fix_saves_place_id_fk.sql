-- ===========================================================
-- 031_fix_saves_place_id_fk.sql
--
-- Patch: drop the leftover saves.place_id FK that points at
-- blackbook (the old places table, now renamed). It was the
-- ORIGINAL pre-Job-1 FK; survived the rename because Postgres
-- auto-renames the target table in existing FKs.
--
-- Migration 030 (Job 5) tried to add the same column with a FK
-- pointing at the NEW places table, but `ADD COLUMN IF NOT EXISTS`
-- silently skipped the column add (column already existed) AND
-- in this codebase's case Postgres ALSO created a second FK
-- (`saves_place_id_fkey1`) pointing at the new places table.
--
-- Result: TWO FKs on saves.place_id, requiring values to satisfy
-- BOTH. Most backfilled rows happened to coincide with valid
-- blackbook ids, but save#44 (place_id=3, which doesn't exist
-- in blackbook) blew up.
--
-- This migration drops the leftover blackbook FK and leaves only
-- the correct places FK in place.
--
-- Idempotent: safe to run twice.
-- ===========================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'saves_place_id_fkey'
       AND conrelid = 'saves'::regclass
  ) THEN
    -- Verify it actually points at blackbook before dropping. If it points
    -- at places, do nothing — schema is already in the correct state.
    IF EXISTS (
      SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.confrelid
       WHERE c.conname = 'saves_place_id_fkey'
         AND c.conrelid = 'saves'::regclass
         AND t.relname = 'blackbook'
    ) THEN
      ALTER TABLE saves DROP CONSTRAINT saves_place_id_fkey;
      RAISE NOTICE 'Dropped leftover saves_place_id_fkey (was → blackbook)';
    END IF;
  END IF;
END $$;

-- Rename the surviving FK to the canonical name (was created as
-- saves_place_id_fkey1 to avoid collision with the leftover one).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'saves_place_id_fkey1'
       AND conrelid = 'saves'::regclass
  ) THEN
    ALTER TABLE saves
      RENAME CONSTRAINT saves_place_id_fkey1 TO saves_place_id_fkey;
    RAISE NOTICE 'Renamed saves_place_id_fkey1 → saves_place_id_fkey';
  END IF;
END $$;

-- Sanity check after running:
--   \d saves
--   -- Foreign-key constraints should now show ONLY:
--   --   "saves_place_id_fkey" FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE SET NULL
