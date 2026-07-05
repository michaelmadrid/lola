-- 035_drop_curated_category.sql
-- curated_category is redundant with category. Drop it.
-- category is the single source of truth for spot type.

ALTER TABLE spots DROP COLUMN IF EXISTS curated_category;
