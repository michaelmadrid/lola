-- 046_board_styling.sql
--
-- Board-level presentation controls, so a board can be composed as a
-- flat catalogue "vitrine" (solid ground, bordered plates, running
-- numbers) as well as the existing dense/mood registers — natively,
-- rather than by baking a background image in Photoshop.
--
--   background_color — CSS color for the frame ground (e.g. '#c9c9c7').
--                      NULL = inherit the page background.
--   background_image — optional image filling the frame, painted over
--                      the color. NULL = none. Drifts with the frame
--                      (it's part of the composition, not a fixed backdrop).
--   show_borders     — draw a hairline border around every item.
--   show_numbers     — print a running index number under every item.
--
-- All nullable/defaulted so existing boards are untouched and render
-- exactly as before.

ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS background_color TEXT,
  ADD COLUMN IF NOT EXISTS background_image TEXT,
  ADD COLUMN IF NOT EXISTS show_borders BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_numbers BOOLEAN NOT NULL DEFAULT false;
