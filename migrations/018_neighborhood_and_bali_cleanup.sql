-- ===========================================================
-- 018_neighborhood_and_bali_cleanup.sql
-- Add neighborhood field on saves. Migrate Bali-area subordinate
-- cities (Canggu, Pererenan, Seseh, etc.) to attach to Bali instead,
-- with the village name carried in saves.neighborhood.
-- Subordinate city rows are kept but marked status=0 (deprecated).
-- ===========================================================

-- 1. Schema: neighborhood column
ALTER TABLE saves
  ADD COLUMN IF NOT EXISTS neighborhood TEXT;

-- 2. Add status=0 meaning "deprecated/hidden" via a comment (no constraint change needed)
COMMENT ON COLUMN cities.status IS '0=deprecated, 1=auto, 2=pending, 3=featured';

-- 3. Ensure Bali exists. If somehow missing, create it featured.
INSERT INTO cities (name, slug, country, status, created_at)
SELECT 'Bali', 'bali', 'Indonesia', 3, NOW()
WHERE NOT EXISTS (SELECT 1 FROM cities WHERE LOWER(name) = 'bali');

-- 4. For each subordinate Bali-area city: re-attach saves to Bali, set neighborhood
DO $$
DECLARE
  bali_id INTEGER;
  hood_record RECORD;
BEGIN
  SELECT id INTO bali_id FROM cities WHERE LOWER(name) = 'bali' LIMIT 1;
  IF bali_id IS NULL THEN
    RAISE NOTICE 'Bali not found, skipping neighborhood migration';
    RETURN;
  END IF;

  FOR hood_record IN
    SELECT id, name FROM cities
    WHERE LOWER(name) IN ('canggu', 'pererenan', 'seseh', 'berawa', 'ubud', 'seminyak', 'kuta', 'sanur', 'uluwatu', 'jimbaran')
      AND id <> bali_id
  LOOP
    -- Set neighborhood on every save attached to this hood-city
    UPDATE saves SET neighborhood = hood_record.name
     WHERE id IN (SELECT save_id FROM save_cities WHERE city_id = hood_record.id)
       AND (neighborhood IS NULL OR neighborhood = '');

    -- Attach those saves to Bali (idempotent)
    INSERT INTO save_cities (save_id, city_id)
    SELECT save_id, bali_id FROM save_cities WHERE city_id = hood_record.id
    ON CONFLICT DO NOTHING;

    -- Detach from the old hood-city
    DELETE FROM save_cities WHERE city_id = hood_record.id;

    -- Mark deprecated
    UPDATE cities SET status = 0 WHERE id = hood_record.id;
  END LOOP;
END $$;

-- 5. Index for filtering by hood
CREATE INDEX IF NOT EXISTS saves_neighborhood_idx ON saves(neighborhood) WHERE neighborhood IS NOT NULL;
