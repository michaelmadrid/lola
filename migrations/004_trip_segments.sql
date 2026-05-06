-- ===========================================================
-- 004_trip_segments.sql
-- A trip is a sequence of segments. Each segment is either
-- attached to a city (city_id) or to a free-text region
-- (region_label like "Portugal Coast"). Both can have date
-- ranges within the trip.
--
-- This replaces trip_days/travel_legs as the V1 model, but
-- those tables are NOT dropped — they stay for v0.3 itinerary
-- imports if we re-enable that feature later.
-- ===========================================================

CREATE TABLE IF NOT EXISTS trip_segments (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  city_id INTEGER REFERENCES cities(id) ON DELETE SET NULL,
  region_label VARCHAR(255),  -- "Portugal Coast", "Tuscany Coast" etc.
  date_start DATE,
  date_end DATE,
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  -- one of city_id or region_label must be set
  CONSTRAINT segment_has_target CHECK (city_id IS NOT NULL OR region_label IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS trip_segments_trip_id_idx ON trip_segments(trip_id);
CREATE INDEX IF NOT EXISTS trip_segments_city_id_idx ON trip_segments(city_id);
CREATE INDEX IF NOT EXISTS trip_segments_dates_idx ON trip_segments(date_start, date_end);
