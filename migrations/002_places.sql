-- ===========================================================
-- 002_places.sql
-- The Index. Curated places (bookshops, coffee, galleries, etc).
-- Public read for everyone, write requires auth (admin/curator).
-- ===========================================================

CREATE TABLE IF NOT EXISTS places (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255),
  city_id INTEGER REFERENCES cities(id) ON DELETE SET NULL,
  category VARCHAR(64) NOT NULL,
  address TEXT,
  maps_url TEXT,
  url TEXT,
  description TEXT,
  hours TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS places_city_id_idx ON places(city_id);
CREATE INDEX IF NOT EXISTS places_category_idx ON places(category);
CREATE INDEX IF NOT EXISTS places_is_public_idx ON places(is_public);
CREATE INDEX IF NOT EXISTS places_slug_idx ON places(slug);

-- For the public Index page, we'll commonly query:
-- SELECT p.*, c.name as city_name, c.country
-- FROM places p
-- LEFT JOIN cities c ON p.city_id = c.id
-- WHERE p.is_public = TRUE
-- ORDER BY p.name;
