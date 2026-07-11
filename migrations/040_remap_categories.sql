-- ===========================================================
-- 040_remap_categories.sql
--
-- Remaps old category values to the new unified category set.
--
-- Changes:
--   film_lab, film lab  → make
--   record_store        → recordstore
--   hotel               → stay
--   see                 → visit
--
-- Idempotent: UPDATE WHERE is safe to re-run.
-- ===========================================================

UPDATE spots SET category = 'make'        WHERE category IN ('film_lab', 'film lab');
UPDATE spots SET category = 'recordstore' WHERE category = 'record_store';
UPDATE spots SET category = 'stay'        WHERE category = 'hotel';
UPDATE spots SET category = 'visit'       WHERE category = 'see';
