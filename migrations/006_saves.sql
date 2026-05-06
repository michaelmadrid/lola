-- ===========================================================
-- 006_saves.sql
-- Saves are the raw capture inbox.
-- Type whatever, hit enter, it lands here.
-- Can later be promoted to a place, or just stay as a save.
-- ===========================================================

CREATE TABLE IF NOT EXISTS saves (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',                                    -- ['paris', 'coffee']
  url TEXT,                                                    -- if save included a URL
  trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,     -- auto-bound if today is in a trip
  city_id INTEGER REFERENCES cities(id) ON DELETE SET NULL,    -- if save references a known city
  place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,   -- if promoted to Index
  archived_at TIMESTAMP,                                        -- soft delete
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saves_user_id_idx ON saves(user_id);
CREATE INDEX IF NOT EXISTS saves_trip_id_idx ON saves(trip_id);
CREATE INDEX IF NOT EXISTS saves_created_at_idx ON saves(created_at DESC);
CREATE INDEX IF NOT EXISTS saves_tags_idx ON saves USING GIN(tags);  -- fast tag filtering
CREATE INDEX IF NOT EXISTS saves_archived_at_idx ON saves(archived_at);
