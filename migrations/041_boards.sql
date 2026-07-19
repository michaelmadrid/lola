-- 041_boards.sql
--
-- BOARDS ("Editions") — hand-composed vitrine layouts, an alternative
-- to the raw board_notes feed on the POSTO homepage. A board is a
-- curated set of notes with per-item size/position, built in the
-- admin, published when ready. home_config decides whether the live
-- homepage pulls the raw feed or a specific published board.
--
-- Placement is viewport-relative (height_pct / top_pct), not fixed
-- pixels — same unit the homepage's drift already uses for item
-- height today, just per-item instead of one global config value.
-- This is what makes a board render identically at any screen size
-- without a separate "canvas" concept to reconcile against.

CREATE TABLE IF NOT EXISTS boards (
  id            SERIAL PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  vibe          TEXT,                              -- short curatorial note, markdown ok
  status        TEXT NOT NULL DEFAULT 'draft',      -- 'draft' | 'published' | 'archived'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS boards_user_updated_idx ON boards(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS board_items (
  id          SERIAL PRIMARY KEY,
  board_id    INT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  note_id     INT NOT NULL REFERENCES board_notes(id) ON DELETE CASCADE,
  position    INT NOT NULL DEFAULT 0,               -- left-to-right drift order (sequence, not a coordinate)
  height_pct  NUMERIC(5,2) NOT NULL DEFAULT 70.00,   -- % of viewport height — same unit as today's CONFIG.itemHeightRatio, now per-item
  top_pct     NUMERIC(5,2) NOT NULL DEFAULT 50.00,   -- % of leftover vertical room (viewport_height - item_height). 0 = pinned top, 100 = pinned bottom
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT board_items_height_pct_range CHECK (height_pct > 0 AND height_pct <= 100),
  CONSTRAINT board_items_top_pct_range    CHECK (top_pct >= 0 AND top_pct <= 100)
);
CREATE INDEX IF NOT EXISTS board_items_board_idx ON board_items(board_id, position);
CREATE INDEX IF NOT EXISTS board_items_note_idx  ON board_items(note_id);

-- Single-row switch: does the public homepage pull the raw
-- board_notes feed, or a specific published board? Enforced to
-- exactly one row via the id=1 check, same "one row of config"
-- pattern as a settings table — simpler than a boolean flag scattered
-- across the boards table (which would need app-level enforcement
-- of "only one board can be is_home at a time" instead of the DB
-- just... only having one row to update).
CREATE TABLE IF NOT EXISTS home_config (
  id          INT PRIMARY KEY DEFAULT 1,
  source      TEXT NOT NULL DEFAULT 'feed',   -- 'feed' | 'board'
  board_id    INT REFERENCES boards(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT home_config_singleton CHECK (id = 1),
  CONSTRAINT home_config_source_check CHECK (source IN ('feed', 'board'))
);

-- Seed the single row if it doesn't exist yet — defaults to today's
-- behavior (raw feed) so nothing changes on deploy until someone
-- actively publishes and selects a board in the admin.
INSERT INTO home_config (id, source, board_id)
VALUES (1, 'feed', NULL)
ON CONFLICT (id) DO NOTHING;
