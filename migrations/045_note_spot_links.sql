-- 045_note_spot_links.sql
--
-- Relate notes and spots to each other. A note can relate to many
-- spots and a spot to many notes, so this is a join table — the
-- relationship is bidirectional for free (query from either end).
--
-- `source` records HOW a link was made, so an auto-matching batch
-- (URL match, suggestions) can later be reversed wholesale without
-- touching hand-made links:
--   'manual'    — a human linked them in the editor
--   'url_match' — auto-linked because note.reference_url and
--                 spot.website/url share a base domain
--   'suggested' — proposed by a scan, not yet confirmed (future)
--
-- There is deliberately NO has_links flag on notes/spots: whether an
-- item has links is derived from COUNT(*) here, so it can never drift
-- out of sync with reality. The list endpoints return a link_count.

CREATE TABLE IF NOT EXISTS note_spot_links (
  note_id    INT  NOT NULL REFERENCES board_notes(id) ON DELETE CASCADE,
  spot_id    INT  NOT NULL REFERENCES spots(id)       ON DELETE CASCADE,
  source     TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (note_id, spot_id)
);

-- Query from either direction efficiently.
CREATE INDEX IF NOT EXISTS note_spot_links_note_idx ON note_spot_links(note_id);
CREATE INDEX IF NOT EXISTS note_spot_links_spot_idx ON note_spot_links(spot_id);
-- Undo a bad auto-batch by source.
CREATE INDEX IF NOT EXISTS note_spot_links_source_idx ON note_spot_links(source);
