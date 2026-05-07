-- ===========================================================
-- 017_drop_save_address.sql
-- Drop saves.address and saves.address_source.
-- AI was conservatively returning null for ~all addresses (correct behavior),
-- and user has no real workflow that types addresses. Removing for clarity.
-- May add back later when there's a Google Places integration.
-- ===========================================================

ALTER TABLE saves DROP COLUMN IF EXISTS address;
ALTER TABLE saves DROP COLUMN IF EXISTS address_source;
