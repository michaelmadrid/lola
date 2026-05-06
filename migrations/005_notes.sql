-- ===========================================================
-- 005_notes.sql
-- Unified "notes" table — what we used to call journal/city_notes.
-- A note can attach to:
--   - a date (day note)
--   - a trip (trip-level note)
--   - a city (accumulated across all visits)
--   - a place (notes about a specific Index entry)
--   - a trip_segment (notes about one stretch of a trip)
--
-- All foreign keys are nullable. A note has at least ONE of
-- the attachments set (enforced via CHECK).
--
-- v0.3's journal/city_notes/city_links tables stay — data
-- preserved. New code writes here only.
-- ===========================================================

CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,

  -- polymorphic attachments (any combination, at least one)
  date DATE,                                                       -- day note
  trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,          -- trip note
  segment_id INTEGER REFERENCES trip_segments(id) ON DELETE CASCADE,
  city_id INTEGER REFERENCES cities(id) ON DELETE CASCADE,         -- city note
  place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,        -- place note

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT note_has_attachment CHECK (
    date IS NOT NULL
    OR trip_id IS NOT NULL
    OR segment_id IS NOT NULL
    OR city_id IS NOT NULL
    OR place_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS notes_user_id_idx ON notes(user_id);
CREATE INDEX IF NOT EXISTS notes_date_idx ON notes(date);
CREATE INDEX IF NOT EXISTS notes_trip_id_idx ON notes(trip_id);
CREATE INDEX IF NOT EXISTS notes_city_id_idx ON notes(city_id);
CREATE INDEX IF NOT EXISTS notes_place_id_idx ON notes(place_id);
CREATE INDEX IF NOT EXISTS notes_created_at_idx ON notes(created_at DESC);
