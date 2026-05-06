-- ===========================================================
-- 007_user_roles.sql
-- Add role column to users for future admin gating.
-- Existing users default to 'user'. Set to 'admin' manually:
--   UPDATE users SET role = 'admin' WHERE email = 'your@email';
-- ===========================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(32) DEFAULT 'user';

-- Roles for V1: 'user', 'curator', 'admin'
-- Routes don't enforce roles yet — we'll layer that in later
