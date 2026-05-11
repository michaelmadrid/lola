# kit — decisions log

Append-only record of load-bearing decisions. Read before relitigating a settled question. Add to this when a real decision gets made — don't bury new entries in chat history.

**Format:** Each entry has a date, a one-line summary, and a paragraph of rationale. Rationale is what matters — future-you needs to know **why** to know whether the decision still applies.

**Newest first.**

---

## 2026-05-11 · Print stylesheet for trip overlay shipped via console paste

Europe 26 itinerary needed to be printable before May 12 flight. The `.modal.itin-fs.is-open` overlay's `position: fixed` + internal scroll clipped print preview to viewport. Console-pasted `@media print` rule hides everything except `.itin-fs`, flattens its overflow, paginates city sections. Worked. Permanent stylesheet to be added to `shell.css` post-trip — anchor is `.modal.itin-fs.is-open`. Console version is in chat history if needed.

## 2026-05-11 · Schema reshape direction set for post-trip

Current `places` table holds blackbook data and will be renamed to `library` or `blackbook`. A new `places` table will hold canonical real-world locations with Google `place_id`, lat/lng, etc. New `cities` table will hold curated city/region entries with type flag (`region` | `city`), country, timezone, lat/lng, radius for geometry-based spot assignment.

Key principle: **Google never reaches user-facing UI.** It's a backend resolver only. Admin uses Google Autocomplete (firehose acceptable behind admin); users see only the curated list. Spots resolve to cities by lat/lng geometry, not by Google's locality field — avoids the "Badung" / "Desa Canggu" mess that plagues Postcard/Amigo.

Decided: place_id is NOT stored on curated cities in v1 (no concrete use case earns the column). Just name, type, country, timezone, lat, lng, radius. Geometry-based matching. Place_id IS stored on individual spots (`saves.google_place_id` already exists per migration 023 — schema-only, no lookup logic yet).

Cities lifecycle: pending → approved → merged → rejected (admin queue for unmatched localities).

Neighborhoods (Canggu, Brooklyn, Le Marais) deferred to V2 — additive migration via `places.neighborhood_id`.

Sequence when work happens (post-trip):
1. Rename `places` → `library`
2. Build new `cities` with geometry resolver, backfill from existing string cities on saves
3. Build new `places` with `place_id`, backfill from `saves.google_place_id`
4. Add `saves.place_id` FK, backfill, drop redundant columns
5. Add `trip_cities` join table
6. Revisit trip-as-plan-vs-itinerary with new structure

## 2026-05-11 · CLAUDE_HANDOFF.md upgraded with deploy workflow, collab style, doc inventory

Previous handoff was philosophy-heavy but lacked: deploy specifics, code-delivery pattern, working files locations, and overlay class anchors. New version captures all four. Also corrected the false claim that Claude could `web_fetch` raw GitHub files — `raw.githubusercontent.com` is blocked at the tool level. The new pattern: Michael uploads files when code-level work is needed.

## 2026-05-11 · Documentation set expanded to five docs

`STYLE_GUIDE.md` already comprehensive. Added: `OVERLAYS.md` (modal/sheet reference), `SCHEMA.md` (tables/relationships), `ARCHITECTURE.md` (server wiring, capture flow), `DECISIONS.md` (this file). Each has a non-overlapping job — see CLAUDE_HANDOFF.md inventory.

Did NOT add a `COMPONENT_INVENTORY.md` because STYLE_GUIDE.md already serves that role. Component reference belongs in the style guide.

## 2026-05-10 · Trip-strip and mini-month removed from home Day module

Phase 4 Checkpoint 6.5. Both modules made the home feel "busy" with data that travel hadn't yet validated. Day module now sparse: date + moon phase + day-of-year + oblique strategies quote. Intentionally a canvas for future design exploration after real-trip evidence reveals what belongs there. Code preserved, UI removed.

## 2026-05-10 · Sharing model = Airtable-style per-object + gatekeep + share limits

Riff documented in `docs/kit-sharing-riff.txt`. Headlines:
- Account-level invite via personal link delivered through user's own channel (text/WhatsApp), never auto-emailed by kit
- Per-object shares: TRIP (with one person, scarcity-enforced), SPOTS-by-city, GUIDE
- Gatekeep flag per spot — single boolean modeling "this place is mine"
- Borrowing = copy-with-attribution snapshot, not live reference
- No friends list UI, no profile pages, no follower graph
- Share limits as values-enforcement (trip shareable with 1 person max)

Not implemented; design direction only.

## 2026-05-10 · Trip dates should become OPTIONAL

States: Draft (no dates, planning canvas) → Dated (itinerary with timeline) → Past (historical notebook). UI adapts to state. One entity, three states. Plan transitions to itinerary by adding dates — no state-change ceremony. Not implemented; design direction only.

## 2026-05-10 · iOS Save-to-kit Shortcut working with JWT

Provisional approach: JWT pasted into Shortcut for auth. Works for now. Real post-trip upgrade: `api_keys` table for labeled, revocable API keys. Opens kit to broader automation (CLI, Raycast, voice, etc.).

## 2026-05 (Phase 4 work) · Design system unified to tokens

Sweep done over multiple sessions in early May. Outcomes:
- 117 color references unified to canonical tokens (`--ink`, `--ink-2`, `--ink-3`, `--rule`, `--accent`, etc.)
- 332 hardcoded font-sizes unified to type-scale tokens (`--text-tiny` through `--text-hero`)
- 85 motion timings unified to `--ease-quick`, `--ease-medium`, `--ease-sheet`
- 30 hardcoded border-radius values unified to `--r-tight`, `--r-input`, `--r-card`, `--r-button`, `--r-pill`, `--r-circle`
- Primitives shipped: `.btn` system, `.btn-close-circle`, `.btn-remove-circle`, `.input`/`.textarea`/`.select`, `.card`, `.caption`
- Mobile touch override extended to new primitives (44px floor with circle exemptions)

What this unlocks: changing kit's button radius is one line. Same for accent color, type scale, spacing rhythm. Future theme variants become token overrides.

See `docs/PHASE4_AUDIT.md` for full audit findings.

## 2026-05 · Trips made private — public publishing pulled

Schema supports publishing trips via `status` + `slug` + `/api/trips/_public/:slug` (migration 026 added). UI to flip status to "published" was deliberately pulled. Reasoning: booking codes, addresses, host names, operational personal data — trips are intimate logistics, not curated content. Guides are the publishable surface. Trips are the private operational space.

Schema kept in case the decision reverses, but adding a publish UI requires rationale that hasn't surfaced.

## 2026-05 · Public surfaces strip identifying data

`/api/guides/_public/:slug` returns author display name only — no `user_id`, no email, no household, no role. This is enforced at the API layer, not the UI layer, so a curious user inspecting network requests sees nothing identifying. Apply same pattern to any future public endpoint.

## 2026-05 · Avatar is permanently bottom-right on mobile

`.floating-avatar` lives at `position: fixed; bottom: 16px; right: 16px;` on screens `<= 720px`. **Nothing else can occupy that slot.** Any future floating action must go bottom-LEFT, top-RIGHT, or inline. This is a muscle-memory contract.

## 2026-05 · No build tooling, ever

Pure HTML / CSS / JS. No bundler, no transpiler, no React, no PostCSS, no SCSS, no live-reload server. Speed is a design principle (CLAUDE_HANDOFF convention #1). Anything that adds a build step gets rejected unless there's a real flag that vanilla can't handle.

Corollary: no npm packages on the frontend. Backend uses `express`, `pg`, `jsonwebtoken`, `dotenv`, and the Anthropic SDK — kept minimal.

## 2026-04 → 05 · Apps area named "Apps"

Considered: Rooms, Experiments, Playground, Workshop. "Apps" wins because it's honest — they ARE little applications. `/apps/juice/` (phrases), `/apps/snake/` (game), `/apps/dual/` (planned). Renamed from `/phrases/` and `/idle/`. Each app gets kit's shell (nav, header, auth) but has its own visual identity in the content area (juice has gradient, snake has retro green).

## 2026-04 → 05 · Public guide URL = `/guide/:slug` not `/g/:slug`

Editorial, readable, dignifies the artifact. Server adds 301 from `/g/:slug` → `/guide/:slug` for any old links. Future: when handles exist, migrate to `/guide/:handle/:slug`. For now (single user) `/guide/:slug` is fine.

This is one of the carve-out 301s; per the philosophy ("clean breaks, no redirects"), no new redirects accumulate.

## 2026-04 → 05 · Centralized nav config in `data/nav.json`

Replaced nav markup duplicated across every HTML file with a JSON-driven system. Single source of truth. Pages embed `<header data-nav="primary">` and `<div data-nav="drawer">`; `js/nav.js` renders. Active state from URL match. This is Phase 1 of the architectural roadmap — done.

Don't add nav items by editing HTML files. Edit `nav.json`.

## 2026-04 · No follower counts, no profiles, no public feeds

Anti-pattern list (Critical Convention #2 in CLAUDE_HANDOFF). Author of a guide is just a name — no profile page exists or will exist at `/profile/:handle`. The schema supports `users.slug` and `users.display_name` for future handle-based URLs, but a profile page is explicitly not built. Authors are bylines, not surfaces.

## 2026-04 · Capture is text-first, AI parses async

Never require categorization at capture time. User types free-form. AI infers structure (place name, city, category, tip) in the background. Original text preserved on `saves.text` forever. See ARCHITECTURE.md capture flow for full pipeline.

If AI parse fails, the save still exists with raw text — never lost. User can edit manually or admin can re-run parse later.

## 2026-04 · Three concepts only

Spots (saves), Trips, Guides. No new top-level entities that overlap. Notes are scoped to dates/cities/trips (not top-level). Todos are utility. Phrases are an app. Anything proposed as a new core concept gets pushed back unless it earns its place.

## 2026-04 · No emojis in UI, no flags

Ink + accent (French blue) only. Single hairlines, no double borders, no thick rules. Mono only for true data (timestamps, codes, IDs, captions via `.caption` primitive). Sans for everything humans read.

Exception: flag emoji could appear in a country-pick UI as functional content. Otherwise no.

## 2026-04 · `.btn-close-circle` standardized — top-LEFT, 32×32, always round

The universal overlay dismiss affordance. Locked square dimensions (`min-width/height` and `width/height` both 32px with `!important` mobile override). Border `--rule`, color `--ink-2` → `--ink` on hover. Top-LEFT of every overlay. NEVER top-right (collides with floating avatar; breaks muscle memory).

Inline-row remove is the 28×28 sibling (`.btn-remove-circle`) with the same shape but `--ink-3` → `--danger` hover. Different intent, deliberate distinction.

## 2026-04 · `--ink-3` (`#777773`) for tertiary text, captions

Specifically chosen to be readable but unmistakably subordinate. Lighter than `--ink-2`, darker than `--rule`. Pair with `.caption` for tiny mono uppercase labels.

Don't use `--ink-3` for primary readable body — that's `--ink`. Don't use it for borders — that's `--rule`. There's a slot for it, keep it in that slot.

## 2026-04 · `2a4ed4` is "French blue" — single saturated color

The only saturated color in kit. Hover states, "selected" pills, user-added accent indicators. Used sparingly. Don't reach for it for decoration or atmosphere.

Same in light and dark mode — reads well on both. Page-specific atmospheric colors (juice gradient stops) may stay hardcoded; they're page-scoped, not system-level.

## 2026-04 · Cream `#f5f5f2` is the canvas

Not white. Not paper-warm. A specific cream that reads "editorial" not "minimal-tech." This pairs with `#ebeae5` (cards) and `#e3e2dc` (deeper hover). The whole light-mode palette is calibrated around this anchor.

Dark mode anchor is `#161614` — not pure black. Slight warmth keeps the register consistent across modes.

---

## How to add an entry

When making a real decision, add an entry at the top of this file with:

```
## YYYY-MM-DD · One-line summary of the decision

Paragraph of rationale. What were the alternatives? Why this? What does this preclude or enable? Reference relevant files, migrations, or other docs.
```

Don't write entries for trivial implementation details — only load-bearing calls. The test: would a future Claude or future-you waste time relitigating this if it weren't written down?

---

End of decisions log.
