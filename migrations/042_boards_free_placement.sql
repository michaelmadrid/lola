-- 042_boards_free_placement.sql
--
-- board_items shipped in 041 with a lane-based model (height_pct +
-- top_pct, sequence-order horizontal position). Design moved to true
-- free x/y placement with overlap ("moving the glass over a fixed
-- photograph" — the whole composed frame drifts as one rigid unit,
-- items never move relative to each other). This migration:
--
--   1. Adds x_pct + width_pct (the new spatial columns)
--   2. Renames top_pct -> y_pct (same concept, clearer name now
--      that there's a matching x_pct sibling)
--   3. Drops height_pct — height now follows from the item's own
--      image aspect ratio at whatever width_pct renders to, same
--      principle as the homepage feed's existing auto-width-from-
--      height logic, just inverted (auto-height-from-width here)
--   4. Repurposes `position` as z-stacking order (front-to-back),
--      not left-right sequence — no rename needed, same column,
--      same "just array/list order" shape, different meaning
--
-- No production board data exists yet (feature isn't launched —
-- home_config.source is still 'feed' for everyone), so this is a
-- clean structural change rather than a backfill situation.

ALTER TABLE board_items
  ADD COLUMN IF NOT EXISTS x_pct NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS width_pct NUMERIC(5,2) NOT NULL DEFAULT 20.00;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'board_items' AND column_name = 'top_pct'
  ) THEN
    ALTER TABLE board_items RENAME COLUMN top_pct TO y_pct;
  END IF;
END $$;

ALTER TABLE board_items DROP COLUMN IF EXISTS height_pct;

-- Old range checks referenced the dropped/renamed columns — replace
-- with ones matching the new shape. x/y allow slight negative/over
-- range (-10 to 110) since items can be dragged partially off-frame
-- during composition, same allowance the prototype's drag clamp used.
ALTER TABLE board_items DROP CONSTRAINT IF EXISTS board_items_height_pct_range;
ALTER TABLE board_items DROP CONSTRAINT IF EXISTS board_items_top_pct_range;

ALTER TABLE board_items
  ADD CONSTRAINT board_items_x_pct_range CHECK (x_pct >= -10 AND x_pct <= 110),
  ADD CONSTRAINT board_items_y_pct_range CHECK (y_pct >= -10 AND y_pct <= 110),
  ADD CONSTRAINT board_items_width_pct_range CHECK (width_pct > 0 AND width_pct <= 100);

COMMENT ON COLUMN board_items.position IS 'Z-stacking order (front-to-back), not left-right sequence. Lower = further back. Same "just array order" shape as before, different meaning.';
