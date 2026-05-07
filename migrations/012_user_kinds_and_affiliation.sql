-- ===========================================================
-- 012_user_kinds_and_affiliation.sql
-- User identity expansion: kinds (person/curator/org/publication)
-- and affiliation (org_id pointing to another user record).
-- KIT itself becomes a user row of kind=org.
-- ===========================================================

CREATE TABLE IF NOT EXISTS user_kinds (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT
);

INSERT INTO user_kinds (id, slug, label, description) VALUES
  (1, 'person',      'Person',      'Individual user'),
  (2, 'curator',     'Curator',     'Notable individual whose picks carry provenance'),
  (3, 'org',         'Organization','Business, label, studio, store'),
  (4, 'publication', 'Publication', 'Magazine, blog, zine, guide')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS kind_id      INTEGER NOT NULL DEFAULT 1 REFERENCES user_kinds(id),
  ADD COLUMN IF NOT EXISTS org_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS slug         TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS verified     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bio          TEXT,
  ADD COLUMN IF NOT EXISTS url          TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_slug_unique ON users(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_org_id_idx ON users(org_id);
CREATE INDEX IF NOT EXISTS users_kind_id_idx ON users(kind_id);

-- Backfill display_name from name where missing
UPDATE users SET display_name = name WHERE display_name IS NULL;

-- Seed the KIT org user (idempotent — checks if exists by slug)
INSERT INTO users (
  email, name, display_name, kind_id, slug, verified, bio, role, created_at
)
SELECT
  'kit@summer-holiday.com',
  'KIT',
  'KIT',
  3,
  'kit',
  true,
  'A travel companion by Summer Holiday',
  'user',
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE slug = 'kit');

-- Note: backfilling Michael + Siska's org_id needs to be done manually with their emails,
-- since we can't hardcode emails here. After deploy:
--   UPDATE users SET org_id = (SELECT id FROM users WHERE slug = 'kit')
--    WHERE email IN ('your.email', 'siska.email');
