-- ===========================================================
-- 024_guides.sql
--
-- Introduces the GUIDES feature.
--
-- A guide is a curated subset of the user's saved spots, organized into
-- named sections (e.g. "Cheap Eats", "Uluwatu", "Best for breakfast").
-- Sections REFERENCE saves by id — saves stay in their own table; guides
-- are a layer on top that selects + organizes + adds editorial framing.
--
-- Editing a save's tip / name / category updates it everywhere it appears,
-- across all guides. That's intentional: a save is the canonical record
-- of a place; a guide is a view of saves.
--
-- Architecture:
--   guides              -- top-level guide record (title, intro, status, slug)
--   guide_cities        -- multi-city support (FUTURE — schema only for V1)
--   guide_sections      -- ordered named buckets within a guide
--   guide_section_items -- save_ids inside sections, with optional override note
--
-- V1 attaches each guide to ONE city via guides.city_id. The
-- guide_cities table exists so multi-city guides can ship without a
-- breaking migration. Until then guide_cities is unused by app code.
--
-- Publish semantics:
--   status = 'draft'      -- private to author, not accessible at /g/:slug
--   status = 'published'  -- accessible at /g/:slug for anyone with the URL
--   status = 'archived'   -- soft hide from index, still owned
--   slug is unique across the table; required when status='published'.
--
-- Hard delete cascades intentionally: deleting a guide removes its
-- sections + items but never the underlying saves.
-- ===========================================================

-- ---------- guides ----------
CREATE TABLE IF NOT EXISTS guides (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city_id      INT REFERENCES cities(id) ON DELETE SET NULL,
  title        TEXT,
  subtitle     TEXT,
  intro        TEXT,                                 -- markdown
  status       TEXT NOT NULL DEFAULT 'draft',        -- 'draft' | 'published' | 'archived'
  slug         TEXT UNIQUE,                          -- nullable until published
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

-- Index for the guides index page query: "give me my guides newest first"
CREATE INDEX IF NOT EXISTS guides_user_updated_idx
  ON guides (user_id, updated_at DESC);

-- Index for public lookups by slug (published guides only — partial index)
CREATE INDEX IF NOT EXISTS guides_slug_idx
  ON guides (slug)
  WHERE status = 'published';

-- ---------- guide_cities (FUTURE — schema only) ----------
-- Reserved for multi-city guides. Until app code uses this table,
-- guides.city_id remains the source of truth for V1.
CREATE TABLE IF NOT EXISTS guide_cities (
  guide_id INT NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  city_id  INT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  PRIMARY KEY (guide_id, city_id)
);

-- ---------- guide_sections ----------
CREATE TABLE IF NOT EXISTS guide_sections (
  id         SERIAL PRIMARY KEY,
  guide_id   INT NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  title      TEXT,                                  -- "Cheap Eats", "Uluwatu", etc.
  intro      TEXT,                                  -- optional section blurb (markdown)
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sections within a guide, ordered by position
CREATE INDEX IF NOT EXISTS guide_sections_guide_pos_idx
  ON guide_sections (guide_id, position);

-- ---------- guide_section_items ----------
-- Each row: a save_id placed inside a section, with optional override note.
-- The note lets the author write a different recommendation for THIS guide
-- than the spot's own tip (e.g. spot tip = "best matcha", guide note = "go
-- for the croissants here, skip the matcha").
CREATE TABLE IF NOT EXISTS guide_section_items (
  id         SERIAL PRIMARY KEY,
  section_id INT NOT NULL REFERENCES guide_sections(id) ON DELETE CASCADE,
  save_id    INT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  note       TEXT,
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Items within a section, ordered by position
CREATE INDEX IF NOT EXISTS guide_section_items_section_pos_idx
  ON guide_section_items (section_id, position);

-- Reverse lookup: "which guides feature this save?" — useful later
-- when displaying "appears in N guides" badges on the spot.
CREATE INDEX IF NOT EXISTS guide_section_items_save_idx
  ON guide_section_items (save_id);
