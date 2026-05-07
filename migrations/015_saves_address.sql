-- ===========================================================
-- 015_saves_address.sql
-- Address fields on saves.
-- address_source values:
--   'ai'        = AI-suggested, not confirmed (default when AI returns one)
--   'confirmed' = user reviewed/edited the address
--   'manual'    = user entered it directly
-- NULL = no address yet
-- ===========================================================

ALTER TABLE saves
  ADD COLUMN IF NOT EXISTS address        TEXT,
  ADD COLUMN IF NOT EXISTS address_source TEXT;
