-- ===========================================================
-- 025_guides_v1_5.sql
--
-- Adjusts the guides schema to support "ungrouped" items.
--
-- V1.5 mental model: items belong to the GUIDE first, sections are
-- an optional grouping overlay. Items with section_id IS NULL are
-- ungrouped — they appear in the guide's flat list.
--
-- Backward compatible: existing rows have section_id populated and
-- continue to work as "sectioned" items. Future rows can omit section_id.
--
-- Future migrations may rename guide_section_items → guide_items
-- since the table is no longer strictly tied to sections.
-- ===========================================================

-- Allow ungrouped items (section_id NULL means "in the guide, no section").
ALTER TABLE guide_section_items
  ALTER COLUMN section_id DROP NOT NULL;

-- For listing all items in a guide (regardless of section), we need
-- an efficient lookup. Items don't currently have a direct guide_id
-- column — the parent is sections. Add it as a denormalized convenience.
--
-- We backfill from existing data, then populate via app code on insert.
ALTER TABLE guide_section_items
  ADD COLUMN IF NOT EXISTS guide_id INT REFERENCES guides(id) ON DELETE CASCADE;

-- Backfill guide_id from the section's guide_id for existing rows
UPDATE guide_section_items gsi
   SET guide_id = gs.guide_id
  FROM guide_sections gs
 WHERE gsi.section_id = gs.id
   AND gsi.guide_id IS NULL;

-- Going forward guide_id is required on all rows
ALTER TABLE guide_section_items
  ALTER COLUMN guide_id SET NOT NULL;

-- Index for "give me all items in this guide" queries (the main read path)
CREATE INDEX IF NOT EXISTS guide_section_items_guide_pos_idx
  ON guide_section_items (guide_id, position);
