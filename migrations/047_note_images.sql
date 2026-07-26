-- 047_note_images.sql
--
-- Optional supporting-image gallery for a note. DELIBERATELY separate
-- from board_notes.image_url, which stays the single "hero" / cover and
-- is what every public surface (shelf/finds, homepage) already reads.
-- The gallery is additive: a note can have a hero AND a cluster of
-- detail shots, without the two being the same list. Nothing public
-- changes — surfaces keep reading image_url unless they opt in.
--
--   position — 0-based display order within the gallery.
--   thumb_url — optional 400px variant (the uploader returns one).

CREATE TABLE IF NOT EXISTS note_images (
  id         SERIAL PRIMARY KEY,
  note_id    INT NOT NULL REFERENCES board_notes(id) ON DELETE CASCADE,
  image_url  TEXT NOT NULL,
  thumb_url  TEXT,
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS note_images_note_idx ON note_images(note_id, position);
