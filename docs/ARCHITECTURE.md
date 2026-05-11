# kit — architecture

How the app is wired. Server entry, route mounting, auth, capture pipeline, page → API map. Read this before working on the backend or anything that touches data.

**Last verified:** May 11, 2026, against server.js + api/.

---

## Stack at a glance

```
        Browser (vanilla HTML/CSS/JS, no build step)
                          │
                          │  fetch() with Bearer JWT
                          ▼
         Express server (server.js, Node 20)
           ├─ static /public served raw
           ├─ /api/* routes mounted from api/routes/
           ├─ /guide/:slug serves g.html
           ├─ legacy 301 redirects (Atlas → Travel)
           └─ catch-all → index.html for client routing
                          │
                          │  pg.Pool
                          ▼
          Postgres 12 (db: lola on droplet)
                          │
                          │  on capture: parseCapture()
                          ▼
              Anthropic API (Haiku 4.5)
              for structured spot extraction
```

No framework. No bundler. No transpiler. Tokens come from `shell.css` `:root` (see STYLE_GUIDE.md). Data comes from API routes. AI parses captures async without blocking the user.

---

## `server.js` walkthrough

The entire entry file is ~60 lines. Worth reading top to bottom — there's no hidden complexity.

```
1.  dotenv config
2.  Express app + JSON body parsing
3.  Legacy 301 redirects (run BEFORE static so they win)
4.  express.static('public')
5.  Mount /api/* routes
6.  /guide/:slug serves g.html for public guide views
7.  Catch-all → index.html (for client-side routes)
8.  Listen on $PORT (default 3000)
```

### Legacy 301 redirects

Server has a small set of permanent redirects, the only routes Michael keeps "legacy" for:

```
/trips.html              → /travel/trips/
/trips-graveyard.html    → /travel/graveyard/
/atlas, /atlas/          → /travel/
/atlas/time*             → /clocks/
/atlas/phrasebook*       → /travel/phrasebook/
/atlas/extras*           → /travel/extras/
/atlas/phrasebook.json   → /travel/phrasebook.json
```

These exist because cached browser bookmarks and old shared links would otherwise 404. Per the philosophy ("clean breaks, no redirects"), no new redirects should be added — Michael accepts a clean break for any new path change.

### Mounted API routes

| Path | File |
|---|---|
| `/api/health` | `api/routes/health.js` |
| `/api/auth` | `api/routes/auth.js` |
| `/api/cities` | `api/routes/cities.js` |
| `/api/places` | `api/routes/places.js` |
| `/api/trips` | `api/routes/trips.js` |
| `/api/notes` | `api/routes/notes.js` |
| `/api/saves` | `api/routes/saves.js` |
| `/api/todos` | `api/routes/todos.js` |
| `/api/guides` | `api/routes/guides.js` |
| `/api/phrases` | `api/routes/phrases.js` |

### `/guide/:slug` — canonical public guide URL

```js
app.get('/guide/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'g.html'));
});
```

The route serves `g.html`, which client-side fetches the guide data via `/api/guides/_public/:slug`. Both the route and the API endpoint are unauthenticated — public guides should be readable without an account.

Legacy `/g/:slug` is parked for the Phase 2 URL change (see STYLE_GUIDE.md and DECISIONS.md).

### Catch-all

```js
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
```

Any non-API path that doesn't match a static file falls through to `index.html`. This makes the app forgiving of typos and supports any future client-side routing.

---

## Auth (`api/auth.js`)

Three middleware exports:

### `authenticate(req, res, next)`
Strict. Requires a valid `Authorization: Bearer <token>` header. JWT verified against `process.env.JWT_SECRET`. Populates `req.user` with the decoded payload. 401s on missing or invalid token.

### `softAuthenticate(req, res, next)`
Permissive. Reads the token if present, sets `req.user` if valid, but **always calls next()**. Used on routes that work for both authed and unauthed users — e.g. `GET /api/cities` returns the public city list either way, but might add user-specific data if signed in.

### `requireAdmin(req, res, next)`
Layered on top of `authenticate`. Requires `req.user.role === 'admin'`. 403 otherwise.

### JWT payload shape

Set at login (`/api/auth/login`). Contains:
- `id` — user id
- `email`
- `role` — `'admin'` or other
- `name`
- (other claims as needed)

30-day expiry. Stored in browser as `localStorage.lola.token` (or `localStorage.getItem('lola_token')` — verify exact key in `api.js`).

### Client side

`public/js/api.js` is the centralized fetch wrapper. Pulls the token from localStorage, attaches the Bearer header, handles 401 by redirecting to login.

---

## Capture flow (the marquee pipeline)

This is the most architecturally interesting flow in kit and worth understanding before touching anything in `saves.js` or `parse-capture.js`.

### Goal

User types free-form text into the capture overlay ("Della Terra Bali sit at the bar, cocktails are insane"). Within a fraction of a second, the spot appears in their stream. Within a few seconds (background), it has parsed structured fields and is attached to the right city.

### Steps

1. **User submits** capture from `.capture-fs` overlay (`capture.js` → `POST /api/saves`)

2. **Save row inserted immediately** in `saves.js`:
   ```sql
   INSERT INTO saves (user_id, text, link_url, tags, been, created_at)
   VALUES ($1, $2, $3, $4, $5, NOW())
   RETURNING *;
   ```
   `text`, `link_url` (extracted), `tags` (extracted hashtags), `been` (from toggle, default true).

3. **Response returns immediately.** Save row is in DB; UI can render the stream item. No AI call has fired yet. This is the "feels instant" part.

4. **Background fires** `parseAndUpdate(saveId, text, opts)` (fire-and-forget — promise not awaited):
   - Calls `parseCapture(text, { boundCityName })` in `parse-capture.js`
   - That hits Anthropic API (Haiku 4.5) with a strict system prompt that extracts:
     - `place_name`, `city`, `neighborhood`, `country`, `timezone`, `category`, `tip`
   - Returns JSON or `{ error: '...' }` on failure

5. **On success**, `parseAndUpdate`:
   - `UPDATE saves SET place_name, category, tip, country, neighborhood, ai_parsed_at = NOW() WHERE id = $1`
   - If a city was detected: `findOrCreateCity(name, country, timezone)` — case-insensitive name match, creates with status=1 on miss, backfills timezone/country on existing rows
   - Inserts `save_cities (save_id, city_id)` join row

6. **On failure** (network, JSON parse, etc.):
   - `UPDATE saves SET ai_parsed_at = NOW(), ai_parse_error = $error WHERE id = $1`
   - Save still exists with raw `text` — never lost. User can edit manually.

### Key design notes

- **`saves.text` is never overwritten.** The user's exact original capture is preserved. AI-derived fields go in separate columns.
- **AI parse is non-blocking.** Save row exists before parse runs. If Anthropic API is slow or down, kit still works — saves just don't get structured fields until parse succeeds (re-runnable later via admin).
- **Bound city hint.** Capture overlay lets user pre-bind to a city. `parseCapture(text, { boundCityName: 'Bali' })` sends that as context to the AI to disambiguate cases like "Copenhagen" being a bakery in Bali vs the city Copenhagen.
- **Category whitelist.** Validated against `['eat', 'drink', 'coffee', 'stay', 'shop', 'see', 'other']` after parse. Anything else → null.
- **Timezone validation.** Must match `^[A-Z][A-Za-z_]+\/[A-Z][A-Za-z_/]+$` (IANA shape). Garbage like "GMT+8" → null.
- **Bali/Paris neighborhood handling** is in the AI prompt itself: Canggu, Marais, etc. are neighborhoods on the parent city (Bali, Paris).

### Re-running parse

`api/routes/saves.js` has admin re-parse endpoints to retry failed parses or to upgrade older saves with newer prompt logic. The pattern is the same: `parseAndUpdate(saveId, save.text, opts)` — called from admin UI or scripts.

---

## Trip visibility (households)

Trips use household-based sharing. Logic in `api/routes/trips.js`:

```js
async function householdMemberIds(userId) {
  // Returns array of user ids in the same household, always including self
}
async function isOwner(tripId, userId)  // created_by check
async function canRead(tripId, userId)   // any household member
async function canEdit(tripId, userId)   // any household member (same as read)
```

Most trip endpoints scope queries to `WHERE created_by = ANY($household_ids)`. Soft delete adds `AND deleted_at IS NULL`. Graveyard view is owner-only.

---

## Public surfaces

Two pages serve public (unauthenticated) content:

### `/guide/:slug` → `g.html`

Renders a published guide. Fetches `/api/guides/_public/:slug` (no auth). The guide endpoint strips identifying user data — returns author display name only, no email, no household, no user_id.

### `/login.html`, `/` (index when signed out)

Unauthed users hitting the app fall through to login. The catch-all sends them to `index.html`, which checks auth client-side and redirects to login if no valid token.

---

## Page → API map

Useful for orientation when touching a specific page.

| Page (HTML) | Primary APIs called |
|---|---|
| `index.html` (home) | `/api/saves` (stream), `/api/trips` (trip strip — removed in C6.5 but JS may still poll), `/api/todos` (parked from UI but routes live) |
| `spots/` (and `saves.html` alias?) | `/api/saves` with filters |
| `travel/` | `/api/trips`, `/api/cities` |
| `trip.html`, `t.html` | `/api/trips/:id` (full trip with segments) |
| `guides/` | `/api/guides` (mine) |
| `guides/[edit].html` | `/api/guides/:id` (mine, full edit data) |
| `g.html` (public) | `/api/guides/_public/:slug` (no auth) |
| `cities.html` | `/api/cities` |
| `admin/` | various admin endpoints across all routes (requireAdmin) |
| `clocks/` | `users.tracked_cities` from `/api/auth/me` |
| `apps/juice/` (phrases) | `/api/phrases` + `public/data/phrases-curated.json` |
| `apps/snake/` | no API — pure local game |
| `settings.html` | `/api/auth/me`, settings update endpoints |

---

## Frontend modules

### `nav.js`
Single source for navigation. Reads `public/data/nav.json`. Renders into pages with `data-nav="primary"` (top inline nav) and `data-nav="drawer"` (mobile menu overlay). Active state determined by current URL match.

This is Phase 1 of the architectural roadmap — done. Don't duplicate nav markup in HTML files; let nav.js render.

### `shell.js`
The footer / global shell behavior. Handles:
- Floating avatar tap → opens user panel
- Slim avatar (desktop) tap → opens user panel
- User panel close (scrim, escape, sheet slide)
- Year/date helpers if used globally

### `api.js`
Centralized fetch wrapper with Bearer token attachment, 401 handling, JSON parsing. Use this for every API call — don't `fetch()` directly.

### `util.js`
Shared utilities: markdown rendering (`safeMarkdown`), text helpers, etc.

### `time.js`
Header time popover behavior. Reads `users.tracked_cities`, computes current time per city, renders the popover.

### `capture-overlay.js` + `capture.js`
The capture overlay shell (city bind, been toggle, popover) and the capture submit pipeline.

### Page-specific JS
`home.js`, `spots.js`, `trips.js`, `trip.js`, `guides-edit.js`, `guides-index.js`, `admin-*.js` — each scoped to its page. Import shared util via `<script>` tags in HTML.

---

## Deploy & ops

See CLAUDE_HANDOFF.md for the full workflow. Headlines:

- **Edit locally** → GitHub Desktop → push to origin/main
- **SSH droplet** → `deploy` alias pulls origin/main
- **`pm2 restart kit`** if backend changed (`server.js` or `api/`)
- **No restart needed** for static frontend changes

**Process:** PM2 manages a single Node process named `kit`. Logs via `pm2 logs kit`. Postgres runs as `lola` db on the same droplet.

**Migrations:** run by hand (`psql -d lola -f migrations/NNN_*.sql`) when adding one. They're idempotent so re-running is safe.

---

## Things parked / not in code yet

- **Photo upload system** — needed for guide editorial template
- **Manual `place_id` entry from admin** for Atlas guides (~30 min build, low priority)
- **Toast/notify system** to replace native confirm/alert
- **Service worker / offline** — useful for travel but adds complexity
- **GitHub webhook auto-deploy** — manual `deploy` preferred for now (gives a beat to verify)
- **`api_keys` table** — for revocable labeled API keys; replaces JWT-in-Shortcut for iOS save flow
- **Print stylesheet for `.modal.itin-fs`** — temp console patch shipped May 11, permanent CSS post-trip

See DECISIONS.md and CLAUDE_HANDOFF.md "Parked design decisions" for full context.

---

End of architecture reference.
