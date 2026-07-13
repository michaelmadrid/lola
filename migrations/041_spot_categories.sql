-- 041_spot_categories.sql
-- Move spot categories from a hardcoded JS constant into an admin-managed
-- table, so the editorial taxonomy can grow/reorder without a deploy.
--
-- spots.category stays a TEXT slug (no FK, no data migration) — this table
-- is the source of the *valid list* + labels + ordering + favorites, not a
-- hard constraint. Deactivating a category (active=false) is non-destructive:
-- existing spots keep their slug; the category just leaves the picker.

CREATE TABLE IF NOT EXISTS spot_categories (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  favorite BOOLEAN NOT NULL DEFAULT false,  -- pinned to top of pickers
  sort_order INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,      -- false = hidden from pickers, spots keep value
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS spot_categories_active_idx ON spot_categories(active);
CREATE INDEX IF NOT EXISTS spot_categories_sort_idx ON spot_categories(sort_order);

-- Seed from the previous hardcoded list. `core: true` becomes favorite.
INSERT INTO spot_categories (slug, label, favorite, sort_order) VALUES
  ('bookstore',    'Bookstore',    true,  10),
  ('film_lab',     'Film Lab',     true,  20),
  ('record_store', 'Record Store', true,  30),
  ('cinema',       'Cinema',       true,  40),
  ('gallery',      'Gallery',      true,  50),
  ('coffee',       'Coffee',       false, 60),
  ('eat',          'Eat',          false, 70),
  ('drink',        'Drink',        false, 80),
  ('hotel',        'Hotel',        false, 90),
  ('shop',         'Shop',         false, 100),
  ('other',        'Other',        false, 110)
ON CONFLICT (slug) DO NOTHING;
