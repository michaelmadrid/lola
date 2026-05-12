# kit — handoff doc for fresh Claude conversations

This doc gives a fresh Claude conversation the context to continue kit work without re-explaining everything. Drop this entire file into a new chat as the first message. Don't summarize it.

**Last major update:** Monday May 11, 2026 (added doc inventory, corrected file-access method, added overlay anchors)

**Update cadence:** Proactively updated at the end of work sessions. Treat this as living. When a decision is made, a class is renamed, a workflow changes — Claude proposes a patch to this file as part of the work, Michael commits it like any other file.

---

## Project basics

- **Project name:** kit (internal/member-facing). Public-facing brand is Summer Holiday. Phrase "made on kit" appears only as production credit.
- **Owner:** Michael Madrid, Bali-based photographer, runs Summer Holiday label.
- **Live URL:** kit.summer-holiday.com
- **GitHub repo:** github.com/michaelmadrid/lola (PUBLIC, branch: main)
- **Droplet:** DigitalOcean 178.128.21.10, Node 20, PM2 process `kit`, Postgres 12 (db: lola)
- **PM2 path:** /root/.nvm/versions/node/v20.20.2/bin/pm2
- **Local working dir (Claude sandbox):** `/home/claude/lola/` (ephemeral per chat — see "Reading the codebase" below)
- **Auth token in browser:** `localStorage.lola.token` (JWT, 30-day expiry)
- **JWT_SECRET:** in droplet `.env` file

---

## Documentation inventory (`docs/`)

Five docs make up kit's living documentation. They have non-overlapping jobs. Read the relevant one(s) for the work at hand, not all five every time.

| File | Read when… |
|---|---|
| `CLAUDE_HANDOFF.md` | Always, at session start. Cover sheet, deploy workflow, collab style, parked decisions. |
| `STYLE_GUIDE.md` | Any CSS, design, or UI work. Tokens, primitives, contracts. Source of truth for design. |
| `OVERLAYS.md` | Any work involving modals, full-screen sheets, popovers. Class anchors and contracts for every overlay. |
| `SCHEMA.md` | Backend / data model work. Tables, columns, relationships, query patterns. |
| `ARCHITECTURE.md` | How server.js wires routes, page → API map, auth flow, capture pipeline. |
| `DECISIONS.md` | When considering a structural change — has this been settled already? Append new decisions here. |
| `PHASE4_AUDIT.md` | Historical record of the May 2026 token unification work. Don't touch. |

---

## Reading the codebase (how Claude gets at the actual files)

**Claude's `web_fetch` cannot reach `raw.githubusercontent.com` or GitHub file blob paths.** It can hit the public repo landing page but not raw files. Don't claim otherwise in instructions.

The working pattern when code-level work is needed:

1. Michael zips the relevant subtree of `lola/` (or the whole repo minus `node_modules` and `.git`) and uploads it to the chat
2. Claude extracts into `/home/claude/lola/` and reads files with `view` / `bash`
3. For small changes, Michael can also paste specific files inline

For doc-only work, philosophy, or planning conversations: no upload needed. The docs themselves carry enough context.

If a fresh Claude says "let me web_fetch your shell.css" — stop them. That's the old wishful claim. Upload instead.

---

## Deploy workflow (how Michael ships code)

This is the established pattern. Stick to it.

```
Claude writes/edits files in sandbox
    ↓
Claude presents files for download (via present_files)
    ↓
Michael drops them into local repo at ~/<wherever>/lola/
    ↓
GitHub Desktop: commit + push
    ↓
SSH into droplet → run `deploy` alias
    ↓
(if server.js or backend route changed) pm2 restart kit
```

**The `deploy` alias on the droplet** is defined in `~/.bashrc`:
```bash
alias deploy="cd /var/www/kit.summer-holiday.com && git pull origin main"
```

So Michael's full deploy after a code change is:
1. Commit + push in GitHub Desktop
2. SSH in
3. `deploy` (pulls from GitHub)
4. `pm2 restart kit` (only if backend changed; static frontend doesn't need it)

**Claude's responsibilities in this workflow:**
- Write the file(s) cleanly
- Tell Michael which files changed and where they go
- Flag when `pm2 restart kit` is needed vs not
- Don't include "and now SCP this up to your server" or other steps Michael doesn't use — he knows the workflow

**Files that DO need pm2 restart:** `server.js`, anything in `api/`, `.env` changes
**Files that DON'T need pm2 restart:** anything in `public/` (HTML, CSS, JS, assets)

### Running migrations on the droplet

Postgres on the droplet rejects `root` connections. Always use `sudo -u postgres`:

```bash
# Run a migration file
sudo -u postgres psql -d lola -f /var/www/kit.summer-holiday.com/migrations/NNN_name.sql

# Inspect a table
sudo -u postgres psql -d lola -c "\d table_name"

# Run an ad-hoc query
sudo -u postgres psql -d lola -c "SELECT count(*) FROM cities WHERE status = 1;"

# Interactive shell
sudo -u postgres psql -d lola
# (then use \dt, \d <table>, \q etc.)
```

**Migration deploy order:** Always run migration BEFORE `pm2 restart kit`. If the code expects a new column/table and you restart first, you'll get 500 errors until migration lands. Order: `deploy` (git pull) → migrate → `pm2 restart kit`.

---

## What kit IS (philosophy)

A personal travel companion / notebook. Member-only feel (invite-only, country-club register). Built as a tool first, social features only added when they strengthen the tool. Three core concepts, no overlap:

- **Spots** — individual saves, tagged by city (table: `saves`; rename to `spots` is parked)
- **Trips** — date-bounded (or undated for planning) travel containers
- **Guides** — published, curated documents (your shareable output)

Aesthetic: editorial-soft, sans + mono, French blue (`#2a4ed4`) as the only saturated color, cream backgrounds, hairline borders. Reference points: Cargo.fyi (design north star), basic.space, Loose Joints, Outliers Guide. NOT: Airbnb, Instagram, generic SaaS.

---

## Current trip context (as of May 11, 2026)

Michael flies **Tuesday May 12 at 5pm**. Europe Trip 26: Paris → Marseille → Lisbon → Portugal Coast → Porto → Umbria → Tuscany Coast → Rome → Berlin, mid-May through late June. Traveling with partner Siska. Hand-carrying copies of his photobook *Dreamlube* to bookstores in Europe (avoiding import duties).

**This timing matters because:** any kit work done before flight should ship to a stable state. Don't introduce architectural changes in the last hours. Travel will surface real product feedback — wait for that evidence.

---

## Tech stack

- **Backend:** Node.js + Express, Postgres 12, raw SQL (no ORM)
- **Frontend:** vanilla HTML + CSS + JS, **NO framework, NO build step**
- **Auth:** JWT bearer tokens (verified in `api/auth.js`)
- **AI:** Anthropic API (Haiku 4.5) for parsing capture text into structured spots — see `api/parse-capture.js`
- **Server file:** `server.js` mounts API routes from `api/routes/`
- **Frontend served from:** `public/` directory

---

## File locations (top-level)

```
lola/
├── api/
│   ├── auth.js                  # authenticate / softAuthenticate / requireAdmin
│   ├── claude.js                # Anthropic SDK wrapper
│   ├── db.js                    # pg Pool singleton
│   ├── parse-capture.js         # AI-parses capture text → structured save fields
│   └── routes/                  # auth, cities, guides, health, notes,
│                                # phrases, places, saves, todos, trips
├── public/
│   ├── index.html               # home (page-grid with modules)
│   ├── login.html, settings.html, places.html, saves.html, cities.html,
│   │   trip.html, t.html, g.html  (public guide view)
│   ├── css/
│   │   ├── shell.css            # ~1416 lines — tokens, primitives, header, modals
│   │   ├── home.css, guides.css, spots.css, travel.css, trip.css,
│   │   ├── apps.css, admin.css, capture.css, login.css, phrases.css, atlas.css
│   │   └── themes/              # pills.css, pills2.css (optional theme variants)
│   ├── js/
│   │   ├── nav.js, shell.js, home.js, spots.js, capture.js,
│   │   ├── capture-overlay.js, trip.js, trips.js, guides-edit.js,
│   │   ├── guides-index.js, time.js, oblique.js, jetlag.js, util.js, etc.
│   ├── data/                    # nav.json, phrases-curated.json
│   ├── apps/                    # juice/ (phrasebook), snake/ (game)
│   ├── travel/, spots/, guides/, admin/, clocks/, capture/, phrases/, fonts/, img/
├── docs/                        # CLAUDE_HANDOFF, STYLE_GUIDE, OVERLAYS, SCHEMA,
│                                # ARCHITECTURE, DECISIONS, PHASE4_AUDIT
├── migrations/                  # SQL migrations 008–027
├── scripts/, server.js, package.json
```

---

## Critical conventions (DO NOT BREAK)

1. **Speed is a design principle.** No framework. Minimal JS. No waterfall API calls.
2. **No social rot patterns.** No follower counts, no profiles, no public feeds, no engagement metrics, no "people you may know."
3. **"Author of a guide is just a name"** — guides have author attribution but no profile pages.
4. **Capture is text-first.** Never require categorization at capture time. AI parsing handles inference.
5. **Three concepts only:** spots, trips, guides. No new entities that overlap existing ones.
6. **Member-only register, country club feel.** Public brand is Summer Holiday; kit is internal.
7. **Tokens before hardcoded values.** Sweep regularly. STYLE_GUIDE.md defines the contracts.
8. **Trips are private artifacts.** Schema supports publishing but UI is intentionally absent — booking codes, addresses, and personal logistics make them unsafe to share. See DECISIONS.md.

---

## How Michael and Claude work together

Read this before writing code.

### Code delivery pattern
- Claude writes complete files in sandbox, presents via `present_files`
- Michael downloads, drops into local repo, commits via GitHub Desktop, pushes
- Then `deploy` on the server (+ `pm2 restart kit` if backend touched)
- **Don't** suggest SCP, rsync, FTP, or any path that bypasses Git. Git is the source of truth.
- **Don't** include Mac-side steps Michael already knows.

### Default behaviors
- **Present full updated files** for download, not patch fragments — Michael wants to drop them in, not hand-merge diffs
- **Name exactly which files changed** so the commit message writes itself
- **Call out the pm2 question** — "no restart needed" or "restart after deploy"
- **Verify class names from the actual code** when working with CSS/JS — if Michael uploaded files, read them; don't guess

### Conversation style that works
- **Real reflection on tradeoffs**, not "sounds great let's do it" yes-man-ing
- **Surface real flags** when something's load-bearing or risky — use phrases like "Real flag:" or "Honest read:" to mark them
- **Pick a recommendation with reasoning**, but always present alternatives
- **Break large work into checkpoints**, ship-and-verify between them
- **Stop when something's done** — don't accumulate scope
- **No emojis in chat output** unless Michael uses them first
- **No flags (country emoji), no decorative formatting**
- **Energy management matters** — won't push past sleep for kit
- **Doesn't keep legacy URLs** — clean breaks, no redirects (with two existing 301 carve-outs in server.js — see ARCHITECTURE.md)

### Things Claude should proactively do
- Read this handoff at session start
- For design work: read STYLE_GUIDE.md before touching CSS
- For overlay/modal work: read OVERLAYS.md first
- For backend/data work: read SCHEMA.md and ARCHITECTURE.md
- For "should we do this" architectural questions: check DECISIONS.md before relitigating
- Propose updates to docs when material changes happen

### Things Claude should NOT do
- Guess at class names or file contents when the actual files are available
- Suggest architectural changes 24 hours before a flight (unless explicitly asked)
- Pad responses with excessive enthusiasm or restate the question
- Add features Michael didn't ask for during a bug fix

---

## Quick overlay reference (for emergencies)

Full reference in OVERLAYS.md. The anchors that have come up in conversation:

| Overlay | DOM | CSS file | When you'd touch it |
|---|---|---|---|
| Trip itinerary | `.modal.itin-fs.is-open` | `home.css` (reused) | t.html, trip.html |
| Capture (new spot) | `.capture-fs.is-open` | `home.css` | Anywhere capture is invoked |
| Save edit | `.modal.save-fs.is-open` | `home.css` | spots/saves pages |
| Year picker | `.year-overlay.is-open` | `home.css` | Home, archive views |
| User panel (account sheet) | `.user-panel.is-open` | `shell.css` | Avatar tap |
| Time popover | `.time-popover.is-open` | `shell.css` | Header time click (desktop) |
| Menu drawer (mobile) | `.menu-overlay.is-open` | `shell.css` | Hamburger tap |

---

## What to do at start of a fresh chat

1. Read this whole doc.
2. If design work is coming: ask Michael to upload the relevant CSS/JS, then read STYLE_GUIDE.md.
3. If overlay/modal work is coming: read OVERLAYS.md, then ask for the files.
4. If continuing a specific feature: ask which one — don't guess.
5. If unsure about a parked item: check DECISIONS.md first, then ask.
6. If asked to do something that contradicts philosophy/conventions: flag it before executing.
7. At session end, propose updates to this or the other docs if anything material changed.

---

End of handoff doc. Future Claude: you have what you need. Now help.
