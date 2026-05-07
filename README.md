# lola

Travel companion + curated index, by Summer Holiday.

Live at [kit.summer-holiday.com](https://kit.summer-holiday.com).

## Stack

- **Backend:** Node 20 + Express 5 + Postgres 12, no ORM (raw SQL with `pg`)
- **Frontend:** Vanilla HTML/CSS/JS, ABC Diatype, served from `/public`
- **Auth:** Email + bcrypt + JWT (30-day token)
- **Deploy:** GitHub → DigitalOcean droplet via PM2

No build step. Static frontend, server is `node server.js`.

## Project structure

```
.
├── server.js                   Slim entry — middleware + route mounting
├── package.json
├── .env.example                Env var template (real .env stays local/server)
├── .gitignore
├── README.md
│
├── api/
│   ├── db.js                   Postgres pool
│   ├── auth.js                 JWT middleware (hard + soft auth)
│   ├── claude.js               Anthropic SDK (kept warm, future use)
│   └── routes/
│       ├── health.js           GET /api/health
│       ├── auth.js             register, login, me
│       ├── cities.js           Cities (incl. neighborhoods via parent_id)
│       ├── places.js           Index entries
│       ├── trips.js            Trips + segments (nested)
│       ├── notes.js            Unified notes (day/trip/city/place)
│       └── saves.js            Captures from homepage
│
├── migrations/                 Numbered SQL files — run in order
│   ├── 001_extend_cities.sql
│   ├── 002_places.sql
│   ├── 003_trips_v05.sql
│   ├── 004_trip_segments.sql
│   ├── 005_notes.sql
│   ├── 006_saves.sql
│   ├── 007_user_roles.sql
│   └── README.md
│
├── public/                     Frontend (static, no build step)
│   ├── index.html              Home (signed-in)
│   ├── login.html
│   ├── trips.html              Trips list
│   ├── trip.html                Single trip detail
│   ├── languages.json          Preserved for future i18n
│   ├── /index/index.html       Public Index page (no auth)
│   ├── /admin/                 CMS (signed-in)
│   │   ├── index.html
│   │   ├── places.html
│   │   ├── cities.html
│   │   └── saves.html
│   ├── /idle/index.html        Idle page (Snake later)
│   ├── /css/
│   │   ├── shell.css           Tokens + header + footer + modal (shared)
│   │   ├── home.css
│   │   ├── login.css
│   │   ├── index.css
│   │   ├── trip.css
│   │   └── admin.css
│   ├── /js/
│   │   ├── api.js              Fetch wrapper with JWT
│   │   ├── shell.js            Header/footer/menu/auth state
│   │   ├── util.js             Helpers (timeAgo, escapeHtml, etc.)
│   │   ├── login.js
│   │   ├── home.js
│   │   ├── trips.js
│   │   ├── trip.js
│   │   ├── index.js
│   │   ├── admin-places.js
│   │   ├── admin-cities.js
│   │   ├── admin-saves.js
│   │   └── snake.js            Placeholder for now
│   └── /fonts/                 ABC Diatype trial files (you upload these)
│
└── scripts/                    For future seed/import scripts
```

## Fonts

The frontend expects four files in `public/fonts/`:

- `ABCDiatypeTrial-Regular.woff2`
- `ABCDiatypeTrial-Medium.woff2`
- `ABCDiatypeMonoTrial-Regular.woff2`
- `ABCDiatypeMonoTrial-Medium.woff2`

Until you copy these in, pages fall back to system fonts. The site still works.

## Local development

```bash
npm install
cp .env.example .env       # edit with your local DB creds
node server.js
```

Visit http://localhost:3000.

## Deploying to droplet

1. Commit + push to GitHub `main`
2. SSH into droplet, run your `deploy` shortcut

## Database migrations (run once after first v0.5 deploy)

See `migrations/README.md` for full notes. Order matters:

```bash
sudo -u postgres pg_dump lola > ~/lola-backup-pre-v05.sql

cd /var/www/kit.summer-holiday.com
sudo -u postgres psql -d lola -f migrations/001_extend_cities.sql
sudo -u postgres psql -d lola -f migrations/002_places.sql
sudo -u postgres psql -d lola -f migrations/003_trips_v05.sql
sudo -u postgres psql -d lola -f migrations/004_trip_segments.sql
sudo -u postgres psql -d lola -f migrations/005_notes.sql
sudo -u postgres psql -d lola -f migrations/006_saves.sql
sudo -u postgres psql -d lola -f migrations/007_user_roles.sql

sudo -u postgres psql -d lola -c "UPDATE users SET role = 'admin' WHERE email = 'YOU@EMAIL';"

pm2 restart lola
```

## Common droplet operations

```bash
pm2 list                       # see processes
pm2 logs lola --lines 50       # tail logs
pm2 restart lola               # restart server
sudo -u postgres psql -d lola  # DB shell
```

## Database backup (recommended weekly)

```bash
sudo -u postgres pg_dump lola > ~/lola-backup-$(date +%Y%m%d).sql
```

## V1 scope (what works now)

- Sign up / sign in / sign out
- Capture inbox on homepage (`+ a place, a thought…` → POST /api/saves)
- Stream of recent saves with hashtag extraction
- Day note (one note per day, attached to active trip if any)
- Active trip auto-detection by today's date
- Idle prompt + generative SVG when no trip is active
- Trips list + create + edit + delete
- Trip detail with segments (cities OR free-text region labels)
- City autocomplete when adding a segment, with "+ create new city" fallback
- Public Index page with category/city filters
- Admin: places CRUD, cities CRUD, saves review/delete
- In-memory todo list on home (not persisted yet — V2)

## Out of scope for V1 (deferred)

- Detailed itinerary import (the v0.3 Claude-parse flow stays in `api/claude.js` for later)
- AI capture parsing
- Place detail pages
- Custom curated lists
- Discover page
- iOS share sheet
- Telegram bot
- Persistent todos
- Real weather API (placeholder text)
- Multi-language (`languages.json` preserved but ignored)
