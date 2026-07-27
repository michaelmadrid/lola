-- 049_note_featured.sql
--
-- "Featured" flag on notes. On the shelf, featured notes claim the hero
-- (wide-span) slots defined by the layout pattern, in the order they
-- appear — first featured fills the first hero slot, and so on. Overflow
-- featured items (and hero slots with no featured item waiting) fall back
-- to normal single-column flow. Distinct from `pin`, which floats a note
-- to the top of feeds; featured is about SCALE, not position.

ALTER TABLE board_notes ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;
