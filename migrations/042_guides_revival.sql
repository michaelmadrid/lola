-- 042_guides_revival.sql
-- Revives the Guides feature for the current (annex, shared-workspace) era.
-- The 024/025 schema is intact and already on spot_id (renamed in 033).
-- This migration only ADDS the display settings we now want; nothing is
-- dropped or altered destructively.
--
-- New on guides:
--   image_url   — single cover image (galleries are a later, shared feature)
--   grouping    — 'list' (flat) | 'category' (cluster spots by category)
--   sort_mode   — 'manual' (drag order via position) | 'alpha' (A–Z snapshot)
--   deleted_at  — soft delete, matching spots/notes
--
-- Ownership note: guides are now a SHARED editorial library. user_id stays as
-- "created by", but any editor can view/edit any guide (enforced in app code,
-- not schema). No column change needed for that.

ALTER TABLE guides ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS grouping TEXT NOT NULL DEFAULT 'list';
ALTER TABLE guides ADD COLUMN IF NOT EXISTS sort_mode TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE guides ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS guides_deleted_at_idx ON guides (deleted_at);
