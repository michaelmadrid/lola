-- 043_notes_mini_pages.sql
-- Notes become "mini-pages": add an off-feed flag, retire Announcement, and
-- make room for the Article type (rich HTML body, non-feed-capable).
--
-- Non-destructive: only adds a column + relabels existing announcement rows.

-- show_in_feed: when false, the note has a permalink and renders fully but
-- does NOT appear in the homepage feed (enables "articles" linked directly).
ALTER TABLE board_notes ADD COLUMN IF NOT EXISTS show_in_feed BOOLEAN NOT NULL DEFAULT true;

-- Retire the Announcement type. Any existing announcements become plain notes.
UPDATE board_notes SET type = 'note' WHERE type = 'announcement';

CREATE INDEX IF NOT EXISTS board_notes_show_in_feed_idx ON board_notes(show_in_feed);
