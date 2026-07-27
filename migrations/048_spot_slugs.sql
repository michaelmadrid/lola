-- 048_spot_slugs.sql
--
-- Add a URL slug to spots for /spot/:slug detail pages (replacing /spot/:id).
-- Populated from place_name; collisions get a plain numeric suffix
-- (daily-press, daily-press-2, daily-press-3 …) assigned by creation order.
-- The API accepts BOTH id and slug, so this is non-breaking.

ALTER TABLE spots ADD COLUMN IF NOT EXISTS slug TEXT;

-- Populate any spot without a slug. slugify(place_name): lowercase, spaces
-- and punctuation → hyphens, collapse repeats, trim. Then de-dupe with a
-- row_number suffix per base slug (ordered by id, so oldest keeps the bare slug).
WITH base AS (
  SELECT
    id,
    NULLIF(
      regexp_replace(
        regexp_replace(lower(coalesce(place_name, 'spot')), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)', '', 'g'
      ),
      ''
    ) AS base_slug
  FROM spots
  WHERE slug IS NULL OR slug = ''
),
numbered AS (
  SELECT
    id,
    coalesce(base_slug, 'spot') AS base_slug,
    row_number() OVER (PARTITION BY coalesce(base_slug, 'spot') ORDER BY id) AS rn
  FROM base
)
UPDATE spots s
SET slug = CASE WHEN n.rn = 1 THEN n.base_slug
                ELSE n.base_slug || '-' || n.rn::text END
FROM numbered n
WHERE s.id = n.id;

-- Enforce uniqueness going forward.
CREATE UNIQUE INDEX IF NOT EXISTS spots_slug_unique ON spots(slug) WHERE slug IS NOT NULL;
