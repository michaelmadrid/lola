-- 037_spots_online_instagram.sql
-- Some curated spots are online-only (pop-ups, web shops with no fixed address)
-- and many have an Instagram presence worth linking.

ALTER TABLE spots ADD COLUMN IF NOT EXISTS online_only BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE spots ADD COLUMN IF NOT EXISTS instagram TEXT;
