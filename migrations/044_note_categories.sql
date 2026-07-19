-- 044_note_categories.sql
-- Notes taxonomy, cloned from spot_categories (041). An admin-managed
-- table so the editorial category list (Shelf, on-the-desk, BLUE, …)
-- can grow/reorder without a deploy — exactly parallel to spots.
--
-- board_notes.category is a TEXT slug (no FK, no hard constraint),
-- same pattern as spots.category: this table is the source of the
-- *valid list* + labels + ordering + favorites, not a constraint.
-- Deactivating a category is non-destructive — notes keep their slug,
-- the category just leaves the picker. One category per note.

CREATE TABLE IF NOT EXISTS note_categories (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  favorite BOOLEAN NOT NULL DEFAULT false,  -- pinned to top of pickers
  sort_order INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,      -- false = hidden from pickers, notes keep value
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS note_categories_active_idx ON note_categories(active);
CREATE INDEX IF NOT EXISTS note_categories_sort_idx ON note_categories(sort_order);

-- The slug each note belongs to. No seed rows — the taxonomy starts
-- empty and is built entirely in the admin (unlike spots, which
-- migrated off a hardcoded list). Nullable: a note can be uncategorized.
ALTER TABLE board_notes
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS board_notes_category_idx ON board_notes(category);
