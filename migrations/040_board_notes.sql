-- 040_board_notes.sql
-- Notice-board style Notes feature ("Theatre of Possibilities"). Lightweight,
-- typed, publishable items for the annex.site front page.
--
-- Named board_notes (not "notes") because an older, dormant `notes` table
-- and /api/notes route already exist (day/trip/city notes concept, unused
-- UI). Kept separate to avoid collision; the old table can be dropped later
-- if confirmed fully dead.
--
-- type is a fixed list for now: note | photograph | link | announcement
-- reference is an optional simple link (title + url) — NOT a relation to
-- spots/guides yet; that's parked until Guides exists.
-- status uses draft/published language (mirrors spots.curated semantics).

CREATE TABLE IF NOT EXISTS board_notes (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  type TEXT NOT NULL DEFAULT 'note',  -- note | photograph | link | announcement
  headline TEXT NOT NULL,
  body TEXT,
  image_url TEXT,

  reference_title TEXT,
  reference_url TEXT,

  status TEXT NOT NULL DEFAULT 'draft',  -- draft | published
  pin BOOLEAN NOT NULL DEFAULT false,
  publish_date TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS board_notes_status_idx ON board_notes(status);
CREATE INDEX IF NOT EXISTS board_notes_pin_idx ON board_notes(pin);
CREATE INDEX IF NOT EXISTS board_notes_publish_date_idx ON board_notes(publish_date DESC);
CREATE INDEX IF NOT EXISTS board_notes_deleted_at_idx ON board_notes(deleted_at);
