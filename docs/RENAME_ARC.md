# kit — schema rename arc

Single source of truth for the post-trip schema reshape: collapse the join table, rename `saves` → `spots`, rename current `places` → `library`, build new canonical `places` table backed by Google Places API (New), and tighten the cities governance to strict admin-curated only.

This doc supersedes scattered notes across CLAUDE_HANDOFF, SCHEMA, and chat history for this work. When a job ships, update its row and add a note in DECISIONS.md if anything shifted.

**Last updated:** May 12, 2026 (Job 6 shipped pre-flight)
**Current state:** Jobs 0.5, 1, 2, 3, 4, 5, 6 shipped. The Google Places integration is fully wired and existing saves can be backfilled on demand. Job 7a (collapse join table) is next — but a natural pause point since Job 7 work is more invasive.

---

## Locked decisions (don't relitigate)

1. **Cities are strictly admin-curated.** The capture pipeline never auto-creates cities. AI may suggest a city, but if it's not in the `cities` table at status=3 (featured), the spot saves without a city link. (See Job 0.5.)
2. **Bound city wins.** When a user binds a capture to a city via the capture overlay, that city is authoritative. AI's parsed city is advisory only. (See Job 0.5.)
3. **`places.city_id` is set from the bound city** at resolution time. The resolver does not call any find-or-create logic on cities. (See Job 4.)
4. **One spot, one city.** The many-to-many `save_cities` join table gets dropped in favor of `spots.city_id` direct FK. Original intent was multi-city support for neighborhood-as-city; that idea was retired in migration 018 (Bali neighborhood cleanup). Join table is now architectural dead weight. (See Job 7a.)
5. **Google Places fields stored on the new `places` table** — `google_place_id`, `name`, `address`, `lat`, `lng`, `primary_type`, `primary_type_label`. Skip `types[]` until a real use case demands it. `primary_type_label` is the snake_case-to-title-case conversion stored for searchability, not display.
6. **Top-result match, AI-parse wins on city.** No multi-candidate confidence threshold for v1. Capture beats perfection — note-taking, not essay-delivering.
7. **No locationBias on Places Text Search in v1.** Rely on textQuery containing the city. Accept Tampopo-style misses. Upgrade if real evidence shows it matters.

---

## Job list

Each job is independently shippable. Each leaves the app working. Sequence matters — don't skip ahead.

| # | Job | Status | Touches | Effort |
|---|---|---|---|---|
| **0.5** | Strict cities + AI prompt | ✅ Shipped 2026-05-12 | `api/routes/saves.js`, `api/parse-capture.js` | done |
| **0.75** | Manual cities cleanup | Deferred (post-trip with evidence) | SQL only, no code | ~30 min |
| **1** | Blackbook rename | ✅ Shipped 2026-05-12 | Migration 028, route file rename, server.js, 2 frontend JS files | done |
| **2** | New `places` table | ✅ Shipped 2026-05-12 | Migration only | done |
| **3** | Places lookup module | ✅ Shipped 2026-05-12 | New file `api/places-lookup.js` + `scripts/test-places-lookup.js` | done |
| **4** | Places resolver | ✅ Shipped 2026-05-12 | New file `api/places-resolver.js` + new `api/routes/places.js` + server.js mount | done |
| **5** | Wire capture pipeline + `place_id` column | ✅ Shipped 2026-05-12 | Migration 030, `api/routes/saves.js` updated | done |
| **6** | Backfill existing saves | ✅ Shipped 2026-05-12 | New script `scripts/backfill-place-ids.js` | done |
| **7a** | Collapse join table | **NEXT** | Migration, route queries that JOIN save_cities | ~45 min |
| **7b** | `saves` → `spots` rename | Planned | Migration, every route file, every frontend fetch | ~2 hours focused |
| **8** | Admin city triage UI | Planned | New admin page + endpoint | ~2 hours |
| **9** | Featured-only audit | Planned | Audit all city pickers, fix any that show non-featured | ~30 min |

---

## Job details

### Job 0.5 — Strict cities + AI prompt

**Goal:** End the silent auto-creation of cities. Make the AI aware of bound city.

**Code changes:**
- Rename `findOrCreateCity` → `findOrEnrichCity` in `api/routes/saves.js`
- Remove the INSERT branch. If a city by name doesn't exist, return null (log to console for visibility, no DB write)
- Keep the enrichment branch (timezone/country backfill on existing rows) as-is — that's useful
- Update all call sites in `parseAndUpdate` and admin re-parse endpoints

**AI prompt change in `api/parse-capture.js`:**
- Add bound city to the prompt context: "User is capturing this from {boundCity}, {country}. This is the authoritative city unless the text obviously references somewhere else (e.g. 'best burgers in Lyon' captured from Bali)."
- AI still returns `city`, but the resolver treats bound city as primary

**Verify after deploy:**
- Capture a spot with AI returning a known featured city → linked correctly
- Capture a spot with AI returning a non-featured city name → save row exists, city link is null, console log present
- No new status=1 rows appear in cities table

**Restart needed:** Yes (`pm2 restart kit`)

---

### Job 0.75 — Manual cities cleanup

**Goal:** Clean up status=1 cities accumulated from past auto-creation. Establish a clean baseline before Job 0.5 deploys.

**SQL to run (psql -d lola):**
```sql
-- See all auto-created cities
SELECT id, name, slug, country, status, created_at
FROM cities
WHERE status = 1
ORDER BY created_at DESC;

-- Check which ones have saves attached
SELECT c.id, c.name, c.status, COUNT(sc.save_id) AS save_count
FROM cities c
LEFT JOIN save_cities sc ON c.id = sc.city_id
WHERE c.status = 1
GROUP BY c.id, c.name, c.status
ORDER BY save_count DESC;
```

**Triage approach for each row:**
- Variant of a featured city (e.g., "Bali, Indonesia" when "Bali" exists at status=3) → reassign saves to featured city, delete the variant
- Real city worth featuring → `UPDATE cities SET status = 3 WHERE id = X`
- Garbage (neighborhoods, AI mistakes) → reassign any saves to the correct featured parent, delete the row

**Reassign saves before deleting:**
```sql
UPDATE save_cities SET city_id = $featured_id WHERE city_id = $auto_id;
DELETE FROM cities WHERE id = $auto_id;
```

**No code changes. Just psql.**

---

### Job 1 — Blackbook rename ✅ Shipped 2026-05-12

**Goal:** Current `places` table → `blackbook`. Clean break, no redirects.

**Naming decision:** During Job 1, the user-facing surface was discovered to already use "Blackbook" (admin/blackbook.html, admin-blackbook.js). The DB and route were the only outliers calling it "places." Renamed to `blackbook` rather than `library` to align all three layers (table / route / UI) on one word, on-brand for the country-club register. (See DECISIONS.md.)

**What shipped:**
- Migration `028_rename_places_to_blackbook.sql` — table + PK + indexes + FK constraints
- `api/routes/blackbook.js` (was `places.js`)
- `server.js` mount: `/api/blackbook`
- Response shape renamed too: `{ places: [...] }` → `{ blackbook: [...] }` for list, `{ place }` → `{ entry }` for single
- `public/js/admin-blackbook.js` — URLs + response key updated
- `public/js/index.js` — URLs + response key + var names updated (this file is currently orphaned — no HTML loads it — but updated for consistency in case re-enabled later)

**Old file to delete locally before commit:** `api/routes/places.js` (just delete it; Git diff will show the rename naturally).

**Restart needed:** Yes (backend change)

---

### Job 2 — New `places` table ✅ Shipped 2026-05-12

**Goal:** Empty canonical table for Google-resolved real-world locations.

**What shipped:** `migrations/029_new_places_table.sql` — creates the table with `google_place_id` UNIQUE NOT NULL, name/address/lat/lng, primary_type + primary_type_label, city_id FK to cities, last_synced_at, created_at. Three indexes (city_id, primary_type, primary_type_label).

**No code changes. Table exists, empty, nothing reads or writes it yet.**

**Restart needed:** No

---

### Job 3 — Places lookup module ✅ Shipped 2026-05-12

**Goal:** Single function that calls Google Places API (New) and returns structured data. No DB writes.

**Param renamed mid-job:** Originally documented as `{ name, cityHint }` (carryover from earlier `locationBias` discussion that we cut). Renamed to `{ name, city }` — clearer that it's the bound city string concatenated into the query, not a fancy bias parameter.

**What shipped:**
- `api/places-lookup.js` — exports `lookupPlace({ name, city })` and `formatPrimaryTypeLabel(snake)`
  - POSTs to `https://places.googleapis.com/v1/places:searchText`
  - FieldMask: `places.id,places.displayName,places.shortFormattedAddress,places.location,places.primaryType` (all Basic SKU)
  - Body: `{ textQuery: "{name} {city}", maxResultCount: 1 }` (city concatenated when present)
  - Returns `{ google_place_id, name, address, lat, lng, primary_type, primary_type_label }` or `null`
  - Throws on network/HTTP/JSON errors (caller decides what to do)
- `scripts/test-places-lookup.js` — hardcoded array of 5 known places + 1 deliberate non-match. Run as `node scripts/test-places-lookup.js` from droplet, prints results.

**Env needed:** `GOOGLE_PLACES_API_KEY` in droplet `.env` (Michael confirmed already set up).

**Restart needed:** No (new file, nothing imports it yet).

---

### Job 4 — Places resolver ✅ Shipped 2026-05-12

**Goal:** Find-or-create logic for the new `places` table.

**What shipped:**
- `api/places-resolver.js` — exports `resolveOrCreatePlace({ name, cityId, cityName })`. Wraps `lookupPlace`, checks for existing row by `google_place_id`, inserts new with `city_id` if missing. Idempotent. `last_synced_at` set only on INSERT (not on existing-match references — see DECISIONS.md).
- `api/routes/places.js` — new route file for the new places table. Mounted at `/api/places`.
  - `GET /api/places/:id` — fetch a place row (authenticated)
  - `POST /api/places/_admin/resolve` — admin-only, body `{ name, city_id }`. Returns `{ place_id, place }` on match, `{ place_id: null }` on no-match. For manual testing and one-off fixes.
- `server.js` — added mount line for the new `/api/places` route.

**Restart needed:** Yes (new route, new mount).

**Test approach:** After deploy, hit the admin endpoint with curl or Postman:
```bash
curl -X POST https://kit.summer-holiday.com/api/places/_admin/resolve \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"Della Terra","city_id":<your_bali_id>}'
```
Returns the new `places` row. Re-run with same name+city → returns same id (idempotent verified).

---

### Job 5 — Wire capture pipeline + `place_id` column ✅ Shipped 2026-05-12

**Goal:** New captures start getting place_ids resolved automatically in background.

**What shipped:**
- `migrations/030_saves_place_id.sql` — `saves.place_id INT REFERENCES places(id) ON DELETE SET NULL` + index
- `api/routes/saves.js` updated `parseAndUpdate`:
  - Added `cityNameFromId` helper for the fallback path where we have a cityId but need the name string for Google's query
  - Track `attachedCityId` and `attachedCityName` through all city-attachment paths (AI match, bound fallback, regex-only) so the resolver always knows which city to pass
  - After AI fields written and city attached, fire-and-forget `resolveOrCreatePlace({ name: parsed.place_name, cityId: attachedCityId, cityName: attachedCityName })`
  - On resolver success → `UPDATE saves SET place_id = $1 WHERE id = $2`
  - On resolver failure → `console.error('[place-lookup-error] save N "name": ...')` for visibility
  - Skipped entirely if AI parse errored (decided: option A, don't gamble on raw text)
  - Skipped if AI returned no place_name (no useful query to send Google)

**Behavior change after deploy:**
- Capture latency: unchanged (~15ms). Resolver runs background, after AI parse, fire-and-forget.
- Every new capture with a successful AI parse + parsed place_name now spawns ONE Google Places call.
- Failures (Google down, ambiguous match) are silent and recoverable — place_id stays null, save still works.

**Restart needed:** Yes (capture code changed).

---

### Job 6 — Backfill existing saves ✅ Shipped 2026-05-12

**Goal:** Resolve pre-existing saves to canonical places via the same resolver the live pipeline uses.

**What shipped:**
- `scripts/backfill-place-ids.js` — Node script, runs from droplet root, no flags or args needed.

**Selection criteria:**
- `place_id IS NULL` (not yet resolved)
- `place_name IS NOT NULL` and non-empty (AI extracted a name)
- Has a city attached via `save_cities` (strict cities rule — won't gamble on Google without a city anchor)

Saves not meeting these criteria are counted as "skipped" and reported at the end. No Google calls burned on them.

**Rate:** 300ms between calls (~3 req/sec). 200 saves = ~60s elapsed. Well under any Google rate limit.

**Idempotency:** Re-running picks up where it stopped. Live captures during a run are also safe — they write `place_id` directly via the live pipeline, and the backfill won't touch already-resolved rows.

**Run from droplet:** `node scripts/backfill-place-ids.js`

**Output shape:**
```
[1/187] save#12 "Della Terra" (Bali) → places.id=1 ✓
[2/187] save#13 "Mosto" (Bali) → places.id=2 ✓
[3/187] save#14 "Some Name" (Paris) → no Google match ✗
...

Done in 56s.
  Resolved: 178
  No match: 6
  Errors:   3
  Skipped:  12 (no place_name or no attached city)
```

**Restart needed:** No (script only).

**Watch for:** API quota usage in Google Cloud Console after the run. 200 calls is ~2% of free tier.

---

### Job 7a — Collapse join table

**Goal:** Replace `save_cities` many-to-many with `saves.city_id` direct FK.

**Migration (`031_saves_city_id.sql`):**
```sql
ALTER TABLE saves ADD COLUMN IF NOT EXISTS city_id INT REFERENCES cities(id) ON DELETE SET NULL;

-- Backfill from join table (every save has 0 or 1 row in save_cities in practice)
UPDATE saves s
SET city_id = (SELECT city_id FROM save_cities WHERE save_id = s.id LIMIT 1)
WHERE s.city_id IS NULL;

CREATE INDEX IF NOT EXISTS saves_city_id_idx ON saves(city_id);

-- Verify no data loss before dropping (manual check via query):
-- SELECT COUNT(*) FROM save_cities WHERE save_id NOT IN (SELECT id FROM saves WHERE city_id IS NOT NULL);
-- Should be 0. Then:
DROP TABLE save_cities;
```

**Code changes:**
- Every `JOIN save_cities` query in `api/routes/saves.js` etc. → simple `LEFT JOIN cities ON saves.city_id = cities.id`
- INSERT logic in `parseAndUpdate` writes `saves.city_id` directly instead of inserting into `save_cities`
- Cleanup any `save_cities` references in admin tooling

**Restart needed:** Yes

---

### Job 7b — `saves` → `spots` rename

**Goal:** The big one. Everything that says `saves` becomes `spots`.

**Migration (`032_rename_saves_to_spots.sql`):**
```sql
ALTER TABLE saves RENAME TO spots;
ALTER INDEX saves_pkey RENAME TO spots_pkey;
-- Rename every other index: saves_user_id_idx, saves_city_id_idx, saves_place_id_idx, etc.
-- Rename FK constraints
```

**Code changes (mechanical, lots of files):**
- Rename `api/routes/saves.js` → `api/routes/spots.js`
- Update queries: `FROM saves` → `FROM spots`
- Update mount in `server.js`: `/api/saves` → `/api/spots`
- Frontend: every `fetch('/api/saves...')` → `/api/spots`
- UI strings: "saved spots" → "spots", "Add a save" → "Add a spot" (some already done)
- Variable names in JS (`save`, `saves`, `saveId` → `spot`, `spots`, `spotId`) — code clarity
- Update STYLE_GUIDE, ARCHITECTURE, SCHEMA, CLAUDE_HANDOFF
- Update this file

**Verify after deploy:**
- Capture works
- Stream loads
- Spot edit overlay works
- All admin tooling works

**Restart needed:** Yes. Do this with focus. Not on the plane.

---

### Job 8 — Admin city triage UI

**Goal:** Manage status=1 cities that accumulated before Job 0.5 (or that show up via admin-add for cities that need adding). Admin promotes to status=3 (featured), merges into existing featured city, or rejects.

**Components:**
- New admin page `/admin/cities` listing status=1 cities with: name, country, save count, created date, suggested action
- Endpoint `PUT /api/admin/cities/:id/status` to promote/demote
- Endpoint `POST /api/admin/cities/:id/merge` body `{ into_id }` to reassign all saves to the target city and delete the source
- Endpoint to manually add a city at status=3 (so new cities can enter the curated set without auto-creation)

**Restart needed:** Yes

---

### Job 9 — Featured-only audit

**Goal:** Every user-facing city picker should filter `WHERE status = 3`. Verify each one.

**Surfaces to audit:**
- Capture overlay's "In [city]" picker (probably already does this)
- Spots filter by city
- Trip city selection
- Guide city selection
- Settings home city picker
- Tracked cities (clocks) picker

**For each:** check the backing query, confirm `status = 3` is in the WHERE clause. Fix any that aren't.

**Restart needed:** Maybe, depending on what changes

---

## How to use this doc

- When starting a session: read this, find the next "Planned" job, start there
- When a job ships: update its row Status → "Shipped MM/DD", add a one-line note if anything surprised you
- If a decision changes: update the Locked Decisions section AND add an entry in DECISIONS.md
- If a job grows: split it into smaller jobs in the table, don't let scope creep silently
- If priorities shift: reorder the table, don't delete jobs

---

## Real flags to remember

- Job 7b is the most invasive job. Reserve focused time. Don't ship it from a café on shaky wifi.
- Backfill (Job 6) might surface AI parse quality issues — "best ramen" might resolve to wrong restaurants without good city context. Be ready to manually correct a few percent.
- The capture flow change in Job 5 means new captures start hitting Google API. Watch the billing dashboard the first few days to make sure quota isn't surprising you.
- Job 8 and 9 are governance. Without them, the strict cities rule (Job 0.5) becomes invisible. Plan time for them.

---

## Parked TODOs (noted, not blockers)

Things flagged during the arc that aren't part of the arc itself. Future-Claude reads this so they don't get re-raised.

- **Admin Blackbook UI/UX refresh.** Modal copy still says "Add place" / "Edit place" / "Delete this place permanently" after the rename. Cosmetic only — functionality fully works. Michael wants to do a broader admin UI/UX pass eventually. Don't drive-by patch this; it's part of a larger admin redesign.
- **Admin Cities triage UI** (Job 8) — formal job, but flagging here too: status=1 rows that accumulated before Job 0.5 will need review. Not urgent because auto-creation is now dead, but the table will benefit from a curated review post-trip.
- **Drop migration-023 columns from `saves`.** `google_place_id`, `google_lookup_status`, `google_lookup_at` were added in migration 023 as schema prep but are now superseded by the `place_id` FK from Job 5. Not actively used by new code. Drop in a future cleanup migration once we're sure no admin tooling references them. Low priority.

---

## Shipped log

### Job 0.5 — Strict cities + AI prompt (2026-05-12)

Shipped pre-flight from Bali. Two file replacements (`api/routes/saves.js`, `api/parse-capture.js`), pm2 restart.

**Test confirmed working:**
- Captured "Tacos Locos in El Paso" while bound to Berlin
- AI correctly identified El Paso (returned `city: "El Paso"`, `country: "United States"`, `tz: "America/Chicago"`)
- `findOrEnrichCity` correctly returned null (El Paso not in cities table)
- Console logged: `[city-not-found] AI suggested "El Paso" — not in cities table, ignoring`
- Save attached to Berlin (bound city fallback) ✓
- No auto-create ✓

**Behavioral note:** AI still returns cities it detects in text even with the tightened prompt — that's correct behavior. The governance layer (strict cities) catches them. The prompt change isn't trying to silence AI's parsing; it's trying to make AI default to bound city for *ambiguous* signals (like "Copenhagen" being a bakery in Bali). Explicit signals like "in El Paso" still override, then get filtered by cities table membership.

**Job 0.75 (manual cleanup) deferred:** Michael's featured cities (Paris, Marseille, Lisbon, Porto, Rome, Berlin, Umbria, Tuscany) are all confirmed status=3. Auto-creation is now dead, so accumulated status=1 rows can be reviewed post-trip with real travel evidence informing the cleanup.

### Job 1 — Blackbook rename (2026-05-12)

Shipped pre-flight from Bali. One zip drop, one commit, one push, deploy + pm2 restart.

**Naming pivot mid-job:** Started as "library rename" per RENAME_ARC. During implementation, the user-facing surface (admin/blackbook.html, admin-blackbook.js) was discovered to already say "Blackbook." Pivoted to `blackbook` instead of `library` to align all three layers (table/route/UI) on one on-brand word. Decision logged in DECISIONS.md.

**Files shipped:**
- `migrations/028_rename_places_to_blackbook.sql` — idempotent rename of table, PK, indexes, FK constraints
- `api/routes/blackbook.js` — replaces `api/routes/places.js`
- `server.js` — mount changed to `/api/blackbook`
- `public/js/admin-blackbook.js` — URLs + response key updated
- `public/js/index.js` — same (orphaned file, updated for consistency)

**Response shape changes:**
- List endpoint: `{ places: [...] }` → `{ blackbook: [...] }`
- Single endpoint: `{ place: ... }` → `{ entry: ... }`

**Scope confirmation:** Only 2 frontend files touch the old `/api/places` — admin-blackbook.js (5 calls) and index.js (1 call). No HTML files reference it directly. Tight scope, low risk.

**Cosmetic copy not yet updated:** The admin Blackbook modal still uses "Add place", "Edit place", "delete this place permanently" wording. UI strings — not breaking anything. Tracked in parked work: admin UI/UX refresh (see CLAUDE_HANDOFF parked list).

### Job 2 — New `places` table (2026-05-12)

Shipped immediately after Job 1. Single migration, no code changes.

**Files shipped:**
- `migrations/029_new_places_table.sql` — creates `places` with all the columns we need for Google Places (New) integration

**Verification:** `sudo -u postgres psql -d lola -c "\d places"` shows clean structure with PK on id, UNIQUE constraint on google_place_id, three indexes (city_id, primary_type, primary_type_label).

**No frontend, no routes, no behavior change.** Table is empty, waiting for Jobs 3-4 to populate it via the resolver, and Job 5 to wire saves to it.

### Job 3 — Places lookup module (2026-05-12)

Shipped after Job 2. Two new files, no migration, no restart.

**Files shipped:**
- `api/places-lookup.js` — exports `lookupPlace({ name, city })` and `formatPrimaryTypeLabel(snake)`. Single POST to Google Places (New) Text Search, FieldMask restricted to Basic SKU. Returns structured object or `null` for no-match. Throws on network/HTTP/JSON errors.
- `scripts/test-places-lookup.js` — hardcoded 6-entry smoke test (5 real names, 1 deliberate non-match). Run as `node scripts/test-places-lookup.js` from droplet.

**Param rename:** Originally specified `{ name, cityHint }`. Renamed to `{ name, city }` because "hint" implied something fancier than what we actually do (string concatenation into `textQuery`). No `locationBias` in v1.

**Verification approach:** Run `node scripts/test-places-lookup.js` from the droplet, eyeball the matches. Burns 6 Google calls (free tier is 10,000/month so this is essentially free).

**Nothing imports `places-lookup.js` yet.** Job 4 builds the resolver that wraps it.

### Job 4 — Places resolver (2026-05-12)

Shipped after Job 3. Wraps the lookup with DB persistence in the new `places` table.

**Files shipped:**
- `api/places-resolver.js` — exports `resolveOrCreatePlace({ name, cityId, cityName })`. Calls `lookupPlace`, finds-or-creates in `places` table. Idempotent. `last_synced_at` set on INSERT only.
- `api/routes/places.js` — new route file mounted at `/api/places`. Provides `GET /:id` (authenticated single-place read) and `POST /_admin/resolve` (admin-only manual resolver trigger).
- `server.js` — added `app.use('/api/places', require('./api/routes/places'));` between blackbook and trips mounts.

**Admin endpoint path:** Specifically `/api/places/_admin/resolve` (not `/api/admin/resolve-place` as earlier docs implied). Kept under `/api/places` so all routes for the new table live in one file. The `_admin` prefix is a convention to mark admin-only endpoints inside a regular route file.

**Verification approach:**
1. Visit `/api/places/_admin/resolve` via curl with a real name + city_id, confirm a match returns 200 with `place` row populated
2. Re-run same request → should return same `place_id` (idempotent)
3. `sudo -u postgres psql -d lola -c "SELECT * FROM places"` → see the row landed correctly

**Nothing in the capture pipeline calls the resolver yet.** Job 5 wires it into `saves.js` `parseAndUpdate` as fire-and-forget after AI parse completes, and adds `saves.place_id` column.

### Job 5 — Wire capture pipeline + `place_id` column (2026-05-12)

Shipped after Job 4. First job in the arc to change real user-visible (well, near-user-visible) behavior — new captures now auto-populate `place_id` in the background.

**Files shipped:**
- `migrations/030_saves_place_id.sql` — adds `saves.place_id` FK column + index
- `api/routes/saves.js` — `parseAndUpdate` now fires `resolveOrCreatePlace` after AI parse completes and city is attached, then UPDATEs the save row with the returned `place_id`

**Architectural shape:**
- Capture POST returns at t≈15ms (unchanged)
- AI parse fires fire-and-forget, completes ~800ms
- After city attachment, place resolver fires fire-and-forget, completes ~1200ms
- All three steps decoupled from HTTP response — user can close window safely
- Failures silent, recoverable (raw text preserved, admin re-resolve endpoint exists)

**Decisions baked in:**
- Skip resolver if AI parse errored (option A from chat) — no place_name = no useful Google query
- Skip resolver if AI returned no place_name (descriptive-only captures like "great coffee" stay unresolved)
- `attachedCityId` + `attachedCityName` tracked through all city-attachment paths (AI match / bound fallback / regex-only) so the resolver always has the right city context
- Resolver errors logged via `[place-lookup-error]` console line, save still works

**Verify after deploy:**
1. Capture a new spot ("Della Terra, sit at the bar" while bound to Bali)
2. Wait ~2 seconds
3. `sudo -u postgres psql -d lola -c "SELECT id, text, place_id FROM saves ORDER BY id DESC LIMIT 1;"` → should show your new save with `place_id` populated
4. `sudo -u postgres psql -d lola -c "SELECT * FROM places ORDER BY id DESC LIMIT 1;"` → should show the resolved Google row

**Google billing note:** Every successful capture now spawns one Google Text Search call. Free tier covers 10,000/month. At kit's current scale this is ~negligible cost. Watch the Google Cloud Console billing dashboard for the first few days regardless.

### Job 6 — Backfill existing saves (2026-05-12)

Shipped after Job 5. Sit-and-watch script. No code changes elsewhere.

**Files shipped:**
- `scripts/backfill-place-ids.js` — iterates eligible saves, calls resolver, updates `place_id`. 300ms delay between calls. Idempotent.

**Decisions baked in:**
- Skip saves without `place_name` (no useful query)
- Skip saves without an attached city (strict cities — won't gamble on Google without anchor)
- Skipped count reported separately at end for visibility
- Idempotent on `place_id IS NULL` — re-run picks up where stopped

**To run:** `node scripts/backfill-place-ids.js` from droplet root. Coffee-and-watch pace.

**Real flag — natural pause point:** Jobs 7a and 7b are more invasive (collapse join table, then rename `saves` → `spots` across every route file and frontend fetch). Worth deploying Jobs 0.5–6 to production, running the backfill, and *sitting with the data* for a few days before tackling Job 7. Real evidence may surface (bad matches that need admin re-resolves, mismatch patterns) that should inform how Job 7 reshapes things.

**Post-deploy patch (2026-05-12, migration 031):** First backfill run surfaced a leftover FK. `saves.place_id` existed BEFORE migration 030 — it was the original pre-rename FK pointing at the old `places` table, which got auto-rewritten to point at `blackbook` during migration 028. Then migration 030's `ADD COLUMN IF NOT EXISTS place_id INT REFERENCES places(id)` silently no-op'd on the column add but Postgres still created a SECOND FK (`saves_place_id_fkey1`) pointing at the new places table. Result: two FKs on the same column, requiring values to satisfy BOTH (impossible going forward). Migration 031 drops the leftover blackbook FK and renames the surviving one to canonical `saves_place_id_fkey`. Idempotent.
