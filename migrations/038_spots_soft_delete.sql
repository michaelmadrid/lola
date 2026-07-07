-- 038_spots_soft_delete.sql
-- Soft-delete for spots (trash area). NULL = live, timestamp = trashed.

ALTER TABLE spots ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS spots_deleted_at_idx ON spots(deleted_at);
