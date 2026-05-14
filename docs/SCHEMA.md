# kit — database schema

The kit data model in one place. Tables, key columns, relationships, and the "why this shape" notes. Read this before writing routes or proposing schema changes.

**Database:** Postgres 12, db `lola` on the DigitalOcean droplet.
**Migrations:** `migrations/008_*.sql` through `migrations/027_*.sql`. Run in order on first deploy; idempotent.
**Connection:** `api/db.js` exports a `pg.Pool` singleton. Use it everywhere — no ORM.

**Last verified:** May 11, 2026, against migrations 008–027.

---

## Migration philosophy

- Each migration is idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)
- Migrations are append-only — never edit a shipped migration, add a new one to alter
- Comments at the top of each migration explain the WHY, not just the what
- Indexes ship with the migrations that introduce the columns they cover

---

## Tables

###  (was  pre-Job 7b, May 14 2026)`users`

Predates the migrations in this folder (created earlier). Holds the human accounts.

Columns confirmed by later migrations:
- `id` — pk
- `email`, `password_hash`, `name` — basic auth fields
- `role` — used by `requireAdmin` middleware (`'admin'` vs other)
- `household_id INT REFERENCES households(id)` — added by migration 010
- `kind_id INT NOT NULL DEFAULT 1 REFERENCES user_kinds(id)` — added by 012 (person/curator/org/publication)
- `org_id INT REFERENCES users(id) ON DELETE SET NULL` — added by 012, self-FK for affiliation
- `slug TEXT`, `display_name TEXT`, `verified BOOLEAN`, `bio TEXT`, `url TEXT` — added by 012
- `home_city_id INT REFERENCES cities(id) ON DELETE SET NULL` — added by 020
- `tracked_cities JSONB NOT NULL DEFAULT '[]'::jsonb` — added by 021, structure `[{city_id, wake_start, wake_end}]`

**Note:** kit itself becomes a user row of `kind=org`. Curated content (bookshops in migration 019, etc.) is attributed to that user. This is the affiliation pattern — user content can be "by" Michael personally or "by" the kit org.

###  (was  pre-Job 7b, May 14 2026)`households`

Migration 010.

```sql
CREATE TABLE households (
  id SERIAL PRIMARY KEY,
  ...
);
```

A group of users who share trip visibility. Michael + Siska are in the same household. Trips are visible to all household members; only the creator can delete.

**Used by `api/routes/trips.js`:**
- `householdMemberIds(userId)` resolves all user IDs in the same household (always includes self)
- `canRead(tripId, userId)` and `canEdit(tripId, userId)` use household membership

###  (was  pre-Job 7b, May 14 2026)`user_kinds`

Migration 012. Reference table for kinds of user.

```sql
CREATE TABLE user_kinds (
  id SERIAL PRIMARY KEY,
  name TEXT
);
-- Values: person, curator, org, publication
```

###  (was  pre-Job 7b, May 14 2026)`cities`

Predates these migrations. Core columns:
- `id` — pk
- `name`, `slug` — display + URL-friendly identifier
- `country`
- `timezone` — IANA timezone string (e.g. "Europe/Paris", "Asia/Makassar")
- `parent_id INT REFERENCES cities(id)` — for neighborhoods/sub-regions (e.g. Pererenan → parent: Bali)
- `status INT NOT NULL DEFAULT 1` — added by migration 013
  - `1` = auto-created (from capture, AI-detected)
  - `2` = pending review (flagged for admin attention)

**Find-or-create pattern:** `api/routes/spots.js` defines `findOrEnrichCity(name, country, timezone)`. Case-insensitive name match; on miss, creates with `status=1`, slug derived from name (with random suffix on collision). Backfills `timezone` / `country` on existing rows when AI provides them.

**Bali special case:** Migration 018 cleaned up Bali area. Villages like Canggu, Pererenan, Seseh, Berawa, Uluwatu, Seminyak, Kuta, Sanur, Ubud, Jimbaran were demoted from being cities to being `spots.neighborhood` strings. Bali is the canonical city; villages live as neighborhoods on the spots themselves.

**Parked (post-trip):** Bigger schema reshape — ~~rename existing `places` to `library`/`blackbook`~~ ✅ done as `blackbook` (Job 1, 2026-05-12), new `places` table with Google `place_id` (Job 2), curated `cities` with `region|city` type flag, geometry-based spot-to-city resolution. See DECISIONS.md and CLAUDE_HANDOFF.md "Parked design decisions."

###  (was  pre-Job 7b, May 14 2026)`blackbook` (formerly `places`)

Predates these migrations as `places`. Renamed to `blackbook` in migration 028 (Job 1, May 12, 2026) to align with the user-facing surface name. Holds curated/admin-managed entries (bookshops, galleries, etc) — kit's editorial blackbook of vetted spots. NOT canonical real-world locations. (Job 2 introduces a new `places` table for that.)

Route: `/api/blackbook`. List response: `{ blackbook: [...] }`. Single response: `{ entry: ... }`.

###  (was  pre-Job 7b, May 14 2026)`places` (new, May 12 2026)

Created in migration 029 (Job 2). Populated via the resolver (Job 4) called from the capture pipeline (Job 5). Canonical real-world locations resolved via Google Places API (New). One row per unique Google `place_id`. Saves point at it via `spots.place_id` (added in Job 5).

Columns:
- `id` — SERIAL PK
- `google_place_id` — TEXT UNIQUE NOT NULL, stable Google identifier (e.g. `ChIJ...`)
- `name` — TEXT NOT NULL, from Google's `displayName.text`
- `address` — TEXT, from Google's `shortFormattedAddress`
- `lat`, `lng` — NUMERIC(10, 7), from Google's `location`
- `primary_type` — TEXT, from Google's `primaryType` (snake_case: `hamburger_restaurant`)
- `primary_type_label` — TEXT, kit-formatted title case: `Hamburger Restaurant` (for searchability, not display)
- `city_id` — INT REFERENCES cities(id) ON DELETE SET NULL, set from bound city at resolve time
- `last_synced_at` — TIMESTAMPTZ, when this row was last refreshed from Google
- `created_at` — TIMESTAMPTZ, defaults to NOW()

Indexes: `places_city_id_idx`, `places_primary_type_idx`, `places_primary_type_label_idx`. UNIQUE constraint on `google_place_id` doubles as its lookup index.

**Why these specific columns:** the FieldMask passed to Google Places Text Search requests exactly these fields. All Basic SKU (no Advanced or Preferred pricing). See ARCHITECTURE.md once Job 3 lands for the request shape.

**What's NOT stored:** `types[]` (the array of all type tags) — deferred until a use case appears. `photos`, `hours`, `phone`, `website` — Google ToS restricts long-term caching of these. Fetch on-demand if a UI ever needs them.

###  (was  pre-Job 7b, May 14 2026)`trips`

Predates these migrations. Soft-delete added by 010, status added by 026.

Columns:
- `id`, `created_by INT` (user)
- `name`, `date_start`, `date_end` (nullable — undated trips are valid planning canvases)
- `notes` — markdown trip-level notes
- `deleted_at TIMESTAMP` — soft delete (010). Non-null = in graveyard.
- `status TEXT NOT NULL DEFAULT 'draft'` — added by 026. Values: `'draft' | 'published' | 'archived'`
- `published_at TIMESTAMPTZ` — set when status flips to published
- `slug TEXT` — for future `/trip/:slug` public URLs

**Visibility rules** (in trips.js):
- Trips are visible to anyone in the trip creator's household
- Only the creator can delete (soft delete to graveyard)
- Graveyard view (`GET /api/trips/graveyard`) only shows trips owned by requesting user

**Real flag:** Trips are private artifacts. Schema supports publishing via `status`/`slug` and a `/trip/:slug` route was planned, but UI to publish was deliberately pulled — booking codes, addresses, and operational data make trips unsafe to publish. See DECISIONS.md.

**Trip segments / itinerary:** Lives in a related table (predates these migrations; not visible in this migration folder). The itinerary structure used by `t.html` / trip.html overlay comes from those segment rows.

### `spots` (was `saves` pre-Job 7b, May 14 2026)

The main spot/save table. Predates these migrations; significantly extended by 011–023.

Core columns:
- `id` — pk
- `user_id` — owner
- `text` — original capture, **never overwritten** (preserves user's exact words)
- `link_url` — extracted URL from the text, if any
- `tags` — array of hashtags extracted from text
- `created_at`

AI-parsed structured fields (migration 014):
- `place_name TEXT` — e.g. "Della Terra"
- `category TEXT` — one of: `eat`, `drink`, `coffee`, `stay`, `shop`, `see`, `other`
- `tip TEXT` — the descriptive/advice part of the text
- `country TEXT`
- `ai_parsed_at TIMESTAMP` — set when parse runs (success or failure)
- `ai_parse_error TEXT` — error message if parse failed

Neighborhood (migration 018):
- `neighborhood TEXT` — village-level sub-region within a city (Canggu, Marais, etc.)

Been flag (migration 022):
- `been BOOLEAN NOT NULL DEFAULT TRUE` — true = visited, false = want-to-go. Default true since most captures are post-visit.

Google Places integration (migrations 023 + 030):
- `google_place_id TEXT` (migration 023) — historical column; now SUPERSEDED by `place_id` FK to `places` table
- `google_lookup_status TEXT` (migration 023) — historical column; not used by the new resolver flow
- `google_lookup_at TIMESTAMP` (migration 023) — historical column; not used by the new resolver flow
- `place_id INT REFERENCES places(id) ON DELETE SET NULL` (migration 030, Job 5) — **THIS is the active column.** Set by the resolver after AI parse. Null when Google has no match, when AI parse failed, or when capture had no parsed place_name.

**Note:** the migration-023 columns are still on spots but unused by the new code. They'll be dropped in a future cleanup migration once we're sure no admin tooling references them. Don't write to them.

Columns DROPPED over time:
- `city_id` (016) — replaced by the `save_cities` join table
- `trip_id` (016) — spots are no longer attached to a single trip
- `address`, `address_source` (017) — AI was conservatively returning null; no real workflow used them

**Capture flow** (see ARCHITECTURE.md for full detail):
1. User submits capture text
2. Save row inserted immediately with `text` filled, other fields null
3. AI parse fires in background (non-blocking) — `parseAndUpdate(spotId, text, opts)` in spots.js
4. On success, fills `place_name`, `category`, `tip`, `country`, `neighborhood`, sets `ai_parsed_at`
5. If a city was detected, `findOrEnrichCity` runs and `save_cities` join row is inserted

### `save_cities` (DROPPED in migration 032, Job 7a, May 13 2026)

Migration 011 originally created this as a many-to-many between saves and cities. Migration 018 (Bali neighborhood cleanup) made the "many" side empty in practice — every save in current data has exactly 0 or 1 city. The table was architectural dead weight.

Migration 032 (Job 7a) collapsed it: added `spots.city_id` as a direct FK, backfilled from the join table, dropped `save_cities`. See DECISIONS.md 2026-05-13.

Replacement: **`spots.city_id INT REFERENCES cities(id) ON DELETE SET NULL`**, indexed via `spots_city_id_idx`.

If a real multi-city use case emerges later, the join table can be reintroduced additively.

###  (was  pre-Job 7b, May 14 2026)`notes`

Predates these migrations. Day-level or city-level freeform notes (used by `api/routes/notes.js`).

###  (was  pre-Job 7b, May 14 2026)`todos`

Migration 009. Notes-app style todos.

```sql
CREATE TABLE todos (
  id SERIAL PRIMARY KEY,
  user_id INT,
  text TEXT,
  completed_at TIMESTAMP,
  archived_at TIMESTAMP,
  sort_order INT,
  ...
);
```

Indexed on `user_id`, `archived_at`, `completed_at`, and `(user_id, sort_order)`.

Completed items stay visible the day they're completed, then auto-archive the next day on first fetch. Removed from the home page in Phase 4 (May 10) — code preserved, UI gone. May return as a module.

###  (was  pre-Job 7b, May 14 2026)Guides tables (migration 024)

Four tables. Architecture: a guide is a curated subset of spots, organized into named sections.

#### `guides`
```sql
CREATE TABLE guides (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city_id INT REFERENCES cities(id) ON DELETE SET NULL,
  title TEXT, subtitle TEXT, intro TEXT,  -- intro is markdown
  status TEXT NOT NULL DEFAULT 'draft',   -- 'draft' | 'published' | 'archived'
  slug TEXT UNIQUE,                       -- nullable until published
  created_at, updated_at, published_at TIMESTAMPTZ
);
```

Indexes:
- `guides_user_updated_idx ON (user_id, updated_at DESC)` — guides index page
- `guides_slug_idx ON (slug) WHERE status = 'published'` — partial index for public lookups

#### `guide_cities` (FUTURE — schema only)
Reserved for multi-city guides. V1 attaches guide to one city via `guides.city_id`. App code doesn't read `guide_cities` yet.

#### `guide_sections`
```sql
CREATE TABLE guide_sections (
  id SERIAL PRIMARY KEY,
  guide_id INT NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  title TEXT,    -- "Cheap Eats", "Uluwatu", etc.
  intro TEXT,    -- markdown
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ
);
```

#### `guide_section_items`
```sql
CREATE TABLE guide_section_items (
  id SERIAL PRIMARY KEY,
  section_id INT NOT NULL REFERENCES guide_sections(id) ON DELETE CASCADE,
  spot_id INT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  note TEXT,           -- guide-specific override of the save's tip
  position INT NOT NULL DEFAULT 0,
  guide_id INT REFERENCES guides(id) ON DELETE CASCADE,  -- added by 025
  created_at TIMESTAMPTZ
);
```

**Important: `note` vs the spot's `tip`.** A save has its own canonical tip ("best matcha"). When included in a guide, the author can provide a guide-specific note ("go for the croissants here, skip the matcha"). The save's own tip is unchanged.

**Editing a save updates it everywhere** — across all guides. Saves are canonical; guides are views.

**Hard delete cascades:** Deleting a guide removes its sections + items but **never** the underlying spots.

**Status semantics:**
- `'draft'` — private to author, no public access
- `'published'` — accessible at `/guide/:slug` (or legacy `/g/:slug`)
- `'archived'` — soft-hide from index, still owned

Slug is unique across the table; required when status='published'.

###  (was  pre-Job 7b, May 14 2026)`phrases`

Migration 027. The phrasebook ("Juice" app) data.

```sql
CREATE TABLE phrases (
  id SERIAL PRIMARY KEY,
  user_id INT,
  ...
);
```

Stores user-added phrases on top of the curated set in `public/data/phrases-curated.json` (5 langs × 10 categories × ~100 phrases).

---

## Relationships at a glance

```
users
  ├─ household_id ──→ households
  ├─ kind_id ──→ user_kinds
  ├─ org_id ──→ users (self)
  └─ home_city_id ──→ cities

trips
  └─ created_by ──→ users

spots
  ├─ user_id ──→ users
  ├─ city_id ──→ cities                     (direct FK since Job 7a, was M:N via save_cities)
  └─ place_id ──→ places                    (canonical Google-resolved location)
                              └─ parent_id ──→ cities (self, for neighborhoods)

guides
  ├─ user_id ──→ users
  ├─ city_id ──→ cities
  └─ M:N via guide_cities ──→ cities  (future)

guide_sections
  └─ guide_id ──→ guides

guide_section_items
  ├─ section_id ──→ guide_sections
  ├─ spot_id ──→ spots         (canonical spot reference)
  └─ guide_id ──→ guides       (denormalized for query convenience, added by 025)

todos       ──→ users
notes       ──→ users
phrases     ──→ users
```

---

## Key query patterns

###  (was  pre-Job 7b, May 14 2026)List trips visible to me (mine + household)
```sql
SELECT t.*, u.name AS owner_name, (t.created_by = $self) AS is_owner
FROM trips t
LEFT JOIN users u ON t.created_by = u.id
WHERE t.created_by = ANY($household_ids)
  AND t.deleted_at IS NULL
ORDER BY COALESCE(t.date_start, t.created_at) DESC;
```

### My spots with cities resolved
```sql
-- Post Job 7a (May 13 2026): direct FK, no join table
SELECT s.*, c.name AS city_name, c.slug AS city_slug
FROM spots s
LEFT JOIN cities c ON s.city_id = c.id
WHERE s.user_id = $1
ORDER BY s.created_at DESC;
```

###  (was  pre-Job 7b, May 14 2026)Public guide by slug
```sql
SELECT g.*, u.display_name AS author
FROM guides g
JOIN users u ON g.user_id = u.id
WHERE g.slug = $1 AND g.status = 'published';
```

###  (was  pre-Job 7b, May 14 2026)Guide with all its sections + items
```sql
SELECT gs.*,
       json_agg(json_build_object(
         'id', gsi.id,
         'save_id', gsi.save_id,
         'note', gsi.note,
         'position', gsi.position
       ) ORDER BY gsi.position) AS items
FROM guide_sections gs
LEFT JOIN guide_section_items gsi ON gs.id = gsi.section_id
WHERE gs.guide_id = $1
GROUP BY gs.id
ORDER BY gs.position;
```

---

## Notes for future schema work

- **No ORM.** Raw SQL via `pool.query()`. Parameterize everything (`$1`, `$2`) — no string interpolation.
- **Always use `IF NOT EXISTS` / `IF EXISTS`** in migrations. Run more than once should be a no-op.
- **Always add an index** when introducing a column that will be queried.
- **Comment migrations heavily.** The top comment block should explain why, not just what.
- **Soft-delete where it matters.** Trips are soft-deleted (graveyard). Saves and guides hard-delete.
- **Cascade thoughtfully.** Spots cascade-delete from users. Guide section items cascade from sections and from spots (deleting a spot removes it from guides — by design, the canonical reference is gone).

---

## Parked schema work (post-trip)

See DECISIONS.md and CLAUDE_HANDOFF.md for full context. Headlines:

1. ~~**Rename `places` → `library` or `blackbook`**~~ ✅ Shipped 2026-05-12 as `blackbook` (Job 1)
2. ~~**New `places` table** for canonical Google-resolved locations with `place_id`, `lat`, `lng`, etc.~~ ✅ Shipped 2026-05-12 (Job 2, empty for now, populated via Jobs 3-5)
3. **Curated `cities` rework** — region/city type flag, editorial governance, geometry-based assignment (not Google's locality field)
4. **`trip_cities` join table** — explicit ordered cities per trip with date ranges
5. ~~**`saves` → `spots` rename**~~ ✅ Shipped 2026-05-14 (Job 7b)
6. **`api_keys` table** for revocable labeled API keys (replaces JWT-in-Shortcut for iOS save flow)

These move together as one focused post-trip session. Don't piecemeal.

---

End of schema reference.
