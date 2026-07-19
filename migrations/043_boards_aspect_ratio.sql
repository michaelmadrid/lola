-- 043_boards_aspect_ratio.sql
--
-- Store the composition aspect ratio PER BOARD, rather than relying
-- on a single global constant shared between the editor and the
-- homepage. Percentage-based item placement (x_pct/width_pct) is
-- relative to the frame's dimensions — so if the frame's aspect ratio
-- ever changes, every item's horizontal position points somewhere
-- different and the whole composition falls apart. Storing the ratio
-- on the board itself means:
--
--   • Each board renders at the exact ratio it was composed against,
--     forever — old boards never break when the default changes.
--   • The default for NEW boards can be changed freely (in the API's
--     create handler) without touching anything already built.
--
-- Stored as two integer components (w:h) rather than a float, so the
-- value is exact and human-readable (e.g. 32 and 9, not 3.5555…).

ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS aspect_w INT NOT NULL DEFAULT 32,
  ADD COLUMN IF NOT EXISTS aspect_h INT NOT NULL DEFAULT 9;

-- Any board created before this migration was composed against the
-- 32:9 canvas that was live at the time, so the defaults above are
-- already correct for them — no backfill needed.
