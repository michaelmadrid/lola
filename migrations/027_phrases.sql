-- ===========================================================
-- 027_phrases.sql
--
-- User-added custom phrases. Curated phrases live in
-- /public/data/phrases-curated.json (no DB rows, shipped with the app).
--
-- Custom phrases attach to a hardcoded category (coffee, food, friends,
-- movement, shopping, stay, going_out, trouble, mood, wifi). The category
-- is just a string — validated by the API against the hardcoded list.
-- This keeps the schema dead simple and lets us add categories later
-- via JSON edit + API allow-list update, no migration.
--
-- translations is JSONB to grow flexibly: {"fr": "…", "es": "…", …}.
-- Languages are filled in lazily on first view of that language (server
-- caches the result here).
-- ===========================================================

CREATE TABLE IF NOT EXISTS phrases (
  id            SERIAL PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,
  text          TEXT NOT NULL,
  translations  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot read path: "all my phrases in this category"
CREATE INDEX IF NOT EXISTS phrases_user_cat_idx
  ON phrases (user_id, category, created_at DESC);
