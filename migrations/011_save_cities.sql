-- ===========================================================
-- 011_save_cities.sql
-- Join table for capture saves auto-tagged with cities.
-- A save can mention multiple cities; a city accumulates many saves.
-- ===========================================================

CREATE TABLE IF NOT EXISTS save_cities (
  save_id INTEGER NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  detected_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (save_id, city_id)
);

CREATE INDEX IF NOT EXISTS save_cities_city_idx ON save_cities(city_id);
CREATE INDEX IF NOT EXISTS save_cities_save_idx ON save_cities(save_id);
