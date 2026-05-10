# kit Style Guide

Canonical reference. **Source of truth for design decisions.** When in doubt, check here first. When something here is wrong, fix the doc and the code together.

Last updated: pre-Europe 2026 trip.

---

## Design tokens (`shell.css` `:root`)

### Colors

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f5f5f2` | `#161614` | Page background |
| `--surface` | `#ebeae5` | `#1f1f1d` | Cards, inputs, secondary surfaces |
| `--surface-2` | `#e3e2dc` | `#262624` | Deeper hover/focus state |
| `--ink` | `#111111` | `#ebeae5` | Primary text |
| `--ink-2` | `#555551` | `#a8a8a3` | Secondary text |
| `--ink-3` | `#777773` | `#8a8a85` | Tertiary text, captions, mono labels |
| `--rule` | `#d8d8d4` | `#2a2a27` | Hairlines, borders |
| `--accent` | `#2a4ed4` | `#2a4ed4` | French blue - hover, active, yours |
| `--danger` | `#c0392b` | `#c0392b` | Destructive states |

**Rules:**
- Never hardcode hex values in component CSS. Use tokens.
- French blue (`--accent`) is the only saturated color in the system.
- Page-specific atmospheric colors (e.g. juice gradient stops) may stay hardcoded - they're page-scoped, not system-level.

### Type

| Token | Value | Use |
|---|---|---|
| `--sans` | ABC Diatype + system fallbacks | All readable text |
| `--mono` | ABC Diatype Mono + system fallbacks | Data, codes, captions, timestamps |
| `--text-tiny` | `11px` | Mono captions, smallest labels |
| `--text-small` | `13px` | Secondary body, helper text |
| `--text-body` | `15px` | Default body, button labels |
| `--text-strong` | `16px` | iOS-safe form inputs, emphasis |
| `--text-medium` | `18px` | Subheads |
| `--text-display` | `22px` | Page titles, h1 |
| `--text-hero` | `36px` | Hero titles, big magazine type |

**Rules:**
- Sans for everything humans read.
- Mono ONLY for true data: timestamps, codes, IDs, captions (use `.caption` primitive).
- Default body line-height ~1.5, letter-spacing -0.005em.

### Spacing

| Token | Value |
|---|---|
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-5` | `20px` |
| `--space-6` | `24px` |
| `--space-7` | `32px` |
| `--space-8` | `48px` |
| `--space-9` | `80px` |
| `--gutter` | `32px` (desktop) / `18px` (mobile) |

### Radius

**Contract: never hardcode `border-radius`. Always reference a token.**

| Token | Value | Use |
|---|---|---|
| `--r-tight` | `2px` | Sharp print-feel - overlay corners, tight inputs |
| `--r-input` | `4px` | Inputs, textareas, search fields |
| `--r-card` | `6px` | Cards, panels, modals, popovers |
| `--r-button` | `8px` | Primary + secondary action buttons |
| `--r-pill` | `999px` | Inline tappable pills |
| `--r-circle` | `50%` | Perfect circles - paired with locked square dims |

### Motion

| Token | Value | Use |
|---|---|---|
| `--ease-quick` | `140ms ease` | Color, bg, border - hover states |
| `--ease-medium` | `200ms ease` | Transform, position changes |
| `--ease-sheet` | `180ms cubic-bezier(0.2, 0.8, 0.2, 1)` | Modal/sheet open & close |

**Rule:** prefer `--ease-quick` for any new component state change.

---

## Buttons

The button system has three sizes (S/M/L) and three style variants (primary/secondary/ghost), plus modifiers for danger and active state.

### Sizes

| Class | Padding | Font size | Use |
|---|---|---|---|
| `.btn` (default) | 12px 22px | `--text-body` (15px) | Standard primary actions |
| `.btn--small` | 8px 14px | `--text-small` (13px) | Inline secondary actions, tight rows |
| `.btn--large` | 14px 28px | `--text-medium` (18px) | Hero CTAs, prominent actions |

All sizes get `min-height: 44px` on mobile (touch target floor).

### Style variants

| Class | Look | Use |
|---|---|---|
| `.btn` (default = primary) | Filled `--ink`, text `--bg`, border `--ink` | Primary action |
| `.btn--secondary` | Transparent fill, `--ink` text, `--rule` border | Secondary action |
| `.btn--ghost` | Transparent fill, `--ink-2` text, no visible border | Tertiary actions |
| `.btn--published` | Filled `--accent`, white text | Indicator-of-state (published, active) |

### Modifiers

| Class | Effect |
|---|---|
| `.btn--danger` | Hover bg/border becomes `--danger` (red). Works on any size/variant. |

### Examples

```html
<!-- Default primary action, medium size -->
<button class="btn">Save</button>

<!-- Small secondary action -->
<button class="btn btn--small btn--secondary">Cancel</button>

<!-- Large primary CTA -->
<button class="btn btn--large">Publish guide</button>

<!-- Ghost button (subtle action) -->
<button class="btn btn--ghost">Skip</button>

<!-- Danger ghost -->
<button class="btn btn--ghost btn--danger">Delete</button>
```

### `.btn-close-circle` - overlay dismiss

```
size:     32x32 (locked square)
radius:   border-radius: 50%
bg:       transparent
border:   1px solid var(--rule)
color:    var(--ink-2) -> var(--ink) on hover
content:  x glyph centered, --text-medium (18px), weight 400
position: top-LEFT of any overlay/modal
mobile:   stays 32x32 (overrides 44px touch floor)
```

Always perfectly round. Never replace with custom button.

### `.btn-remove-circle` - inline-row remove

Canonical 28x28 inline circle. Used inside list rows where the close-circle (32) would be too prominent. Same shape as `.btn-close-circle`, smaller dims, different hover behavior.

```
size:     28x28 (locked square)
radius:   border-radius: 50%
bg:       transparent
border:   1px solid var(--rule)
color:    var(--ink-3) -> var(--danger) on hover
content:  x glyph, --text-body (15px), weight 400
mobile:   stays 28x28 (overrides 44px touch floor)
```

Use this for delete/remove affordances always-visible in list rows.

### Variant: hover-reveal inline remove

For affordances that should reveal only on row hover (NOT always visible), use a custom class. Example: `.time-card__remove` in travel.css starts at opacity 0, hovers to opacity 1, color goes to `--ink` (not `--danger`). Different pattern, different name.

This is a deliberate distinction: there are two kinds of inline remove:
- **Always-visible danger remove** -> `.btn-remove-circle` primitive
- **Hover-reveal subtle remove** -> custom variant per context

### Avatar (mobile floating)

`.floating-avatar` is **fixed bottom-right** on mobile (<=720px). 48x48 circle.

```
right:  calc(16px + env(safe-area-inset-right, 0px))
bottom: calc(16px + env(safe-area-inset-bottom, 0px))
z-index: 90
```

**Implication for any new floating button:** never put another fixed bottom-right button on mobile. It will collide. If you need a floating action, put it bottom-LEFT, top-RIGHT, or inline in the page (not floating).

---

## Navigation vs user panel — separation of concerns

Two separate surfaces, two different purposes:

**Navigation** (`<nav data-nav="primary">` and `<div data-nav="drawer">`):
- Source of truth: `/public/data/nav.json`
- Renders via `/public/js/nav.js`
- Purpose: navigate between top-level sections (Home, Travel, Spots, Guides)
- Lives in: page header (top inline + hamburger drawer)
- Auth-filtered per item

**User panel** (`.user-panel` sheet, triggered by `.floating-avatar` or `.slim-avatar`):
- Purpose: account-level affordances (Settings, Admin, Sign out, profile info)
- Lives in: floating avatar (mobile) / slim avatar in header (desktop)
- Member-only — only renders when signed in

**Rule:** if it's "navigate to a section," it goes in nav.json. If it's "do something with my account," it goes in user panel. Don't duplicate items across both surfaces.

**Don't link to surfaces that don't exist yet.** The Apps area (Phase 3) will add a nav item when shipped — until then, Apps doesn't appear in nav.

---

## Headers

### Default `.head`

```
padding:        26px var(--gutter) 22px       (~74px tall)
display:        grid 1fr / auto / 1fr
gap:            32px
mobile:         padding 12px var(--gutter), height auto, flex-wrap
logo:           mono 14px weight 500, lowercase, color var(--ink)
.nav links:     hidden on mobile (replaced by hamburger overlay)
.head__right:   where + time hidden on mobile (replaced by floating avatar)
```

### Transparent-with-blur variant (used on `/phrases/`)

When a page has a hero background (gradient, image), the header should be transparent with a subtle backdrop-filter so content can flow underneath without losing nav legibility.

```css
.body-phrases .head {
  background: transparent;
  border-bottom: 0;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
```

**Use this pattern wherever** a page has a colored or atmospheric background. Gradient pages, image headers, hero sections. The 8px blur is the canonical value — strong enough to legibilize, soft enough to preserve atmosphere.

### Public-page variant (`.head--public`)

Used on `/g/:slug` (public guides). Same shape, includes a small mono `.head__public-tag` on the right (e.g., "A guide on kit"). No nav links — public pages don't link back into the app's auth-walled surfaces.

---

## Pills

### Filter / category chip

```
font:        sans 14px / weight 600 / letter-spacing -0.01em
padding:     8px 16px
radius:      999px
bg:          rgba(255,255,255,0.6) + backdrop-filter: blur(8px)   (on gradient pages)
             OR var(--field)                                       (on neutral pages)
color:       var(--ink-2) → var(--ink) on hover
active:      bg var(--ink), color var(--bg)
```

Categories are bold. Filters are bold. They look like grabable tags, not interface chrome.

### Content / phrase pill

```
font:        sans 15px / weight 500 / letter-spacing -0.005em
padding:     14px 18px
radius:      14px           (one-off, not in token system — review post-trip)
bg:          rgba(255,255,255,0.7) + backdrop-filter: blur(8px)
border:      1px solid rgba(255,255,255,0.4)
```

When emphasized as "yours" (custom user-added vs curated):
```
border:      1.5px solid var(--blue)
bg:          rgba(255,255,255,0.92)
color of name text: var(--blue)
```

### Inline pill in stream (city, link, batch)

Existing pattern in `home.css` `.stream__chip`. Reference there.

---

## Overlay action contract

For any fullscreen overlay or modal:

| Position | Element |
|---|---|
| Top-LEFT | `.btn-close-circle` (×) |
| Bottom-RIGHT | `.btn` primary action (Save, Publish, etc.) |
| Bottom-RIGHT, LEFT of primary | `.btn--secondary` if you have two actions |
| Bottom-LEFT | Status indicator, helper text |

**Never put the close on the right.** It collides with floating avatar on mobile and breaks established muscle memory.

---

## Forms & inputs (primitives)

Three primitive classes: `.input`, `.textarea`, `.select`. Single shared base for form fields. Each page can extend with its own class for layout (width, position) but should NOT reinvent visual style.

### Shared base styling

```
font:          sans var(--text-strong) (16px, iOS-safe)
color:         var(--ink)
bg:            var(--surface)
hover bg:      var(--surface-2)
border:        1px solid var(--rule)
focus border:  var(--accent)
radius:        var(--r-input) (4px)
padding:       14px 16px
width:         100% (override with page-specific class as needed)
```

### `.input`

Single-line text input. Use for any text/email/url/number input.

```html
<input type="text" class="input" placeholder="Search...">
<input type="email" class="input input--small" placeholder="email@example.com">
```

### `.textarea`

Multi-line input. Resizable vertically by default, min-height 80px.

```html
<textarea class="textarea" placeholder="Notes..."></textarea>
```

### `.select`

Native select with custom chevron (no native browser arrow). Includes appearance reset for cross-browser consistency.

```html
<select class="select">
  <option>Option 1</option>
  <option>Option 2</option>
</select>

<select class="select select--small">
  <option>Tight row variant</option>
</select>
```

### Size variants

`.input--small` and `.select--small` reduce padding and font-size to `--text-small` (13px). Use for tight rows where the standard primitive is too tall. Note: mobile iOS zoom-fix overrides font-size back to 16px.

### iOS zoom mitigation

Any input under 16px on mobile triggers auto-zoom. The shell.css base rule forces all `input/textarea/select` to 16px on mobile via `!important`. Don't override.

### Cards

`.card` primitive for any container that should read as a panel.

```
bg:      var(--surface)
border:  1px solid var(--rule)
radius:  var(--r-card) (6px)
padding: var(--space-5) (20px)
```

Modifiers:
- `.card--interactive` adds hover state for tappable cards (border becomes `--accent`, bg becomes `--surface-2`)
- `.card--tight` reduces padding to `--space-3` (12px) for dense lists

```html
<div class="card">Standard card</div>
<a class="card card--interactive" href="/somewhere">Tappable card</a>
<div class="card card--tight">Dense list item</div>
```

### Captions

`.caption` primitive for tiny mono uppercase labels (timestamps, codes, "DPS to TPE", section markers).

```
font:           mono var(--text-tiny) (11px)
letter-spacing: 0.06em
text-transform: uppercase
color:          var(--ink-3)
```

Modifiers:
- `.caption--ink` darker color (`--ink`)
- `.caption--accent` blue (`--accent`)

```html
<span class="caption">Updated 2h ago</span>
<span class="caption caption--accent">PUBLISHED</span>
```

---

## Page grid (12-column, opt-in)

Pages can opt into a 12-column grid layout via `class="page-grid"` on `<main>`. Modules within the grid declare their span via `.module--N` classes.

### When to use

- Multi-module dashboards (e.g. home)
- Pages with mixed-density content where modules should align to a shared grid
- Pages that benefit from explicit visual rhythm

### When NOT to use

- Single-column lists (spots, travel index, juice phrasebook)
- Forms (use vertical flow, not grid)
- Pages where content is one block (settings, login, capture)

### How it works

```html
<main class="page page-home page-grid">
  <section class="module module--half module--day">
    <!-- left half on desktop, full-width on mobile -->
  </section>
  <section class="module module--half module--capture-stream">
    <!-- right half -->
  </section>
</main>
```

### Span classes

Numeric spans (granular):

| Class | Span |
|---|---|
| `.module--span-1` through `.module--span-12` | 1-12 columns |

Named spans (semantic shortcuts):

| Class | Span | Visual |
|---|---|---|
| `.module--quarter` | 3 cols | 25% |
| `.module--third` | 4 cols | 33% |
| `.module--half` | 6 cols | 50% |
| `.module--two-thirds` | 8 cols | 66% |
| `.module--three-quarters` | 9 cols | 75% |
| `.module--full` | 12 cols | 100% |

### Responsive behavior

**Desktop (>=1101px):** full 12-column grid honors all spans.

**Tablet (721-1100px):** column gap reduced to `--space-6` (24px). Spans are still respected by default. Pages can override per-module to collapse certain modules to full-width on tablet.

**Mobile (<=720px):** all spans ignored; every module becomes full-width (`grid-column: 1 / -1`). Use `order` property to reflow modules into a different sequence on mobile if needed.

### Module order on mobile

Source order is the default. Use CSS `order` to reflow:

```css
@media (max-width: 720px) {
  .module--capture-stream { order: 1; }   /* show first on mobile */
  .module--day            { order: 2; }
}
```

To hide a module entirely on mobile:

```css
@media (max-width: 720px) {
  .module--day { display: none !important; }
}
```

### Pages currently using `.page-grid`

- **Home** (`/`) — 6/6 split: day + launchers (left), capture + stream (right). Day hidden on mobile.

### Pages NOT using `.page-grid`

- Spots, Travel, Travel/Trips, Travel/Trip detail (single-column lists)
- Guides edit, Capture, Settings, Login, Admin (forms / single-block pages)
- Juice (phrasebook viewer — own layout system)

---

## Touch targets (mobile, ≤720px)

Mobile minimum touch floor: **44×44**. Enforced globally via:

```css
@media (max-width: 720px) {
  button, [role=button], .btn, a.btn { min-height: 44px; }
}
```

**Exceptions** (locked smaller via `!important`):
- `.btn-close-circle`: 32×32 (overlay close)
- `.ph-pill__delete`, `.time-card__remove`: 28×28 (inline row remove)
- `.floating-avatar`: 48×48 (deliberately above floor for thumb reach)

When making something smaller than 44px, document why and lock it the same way these do.

---

## Backgrounds

### Default page bg

`var(--bg)`. Plain.

### Atmospheric bg (gradient / hero)

Used on `/phrases/`. Layered radial gradients + film grain PNG.

Pattern:
```css
body.body-phrases {
  background-color: <fallback>;
  background-image:
    url('/img/noise.png'),
    radial-gradient(circle at <x>%, color1, color2 transparent),
    radial-gradient(...secondary bloom...),
    radial-gradient(ellipse, base...edges);
  background-repeat: repeat, no-repeat, no-repeat, no-repeat;
  background-size: 128px 128px, auto, auto, auto;
  background-attachment: fixed, fixed, fixed, fixed;
}
```

Grain tile lives at `/public/img/noise.png` — 128×128, ~20kb, transparent, generated programmatically.

When adding atmosphere to a new page:
1. Pick 2-3 colors from your category palette
2. One hotspot off-center, one secondary bloom opposite, one base ellipse
3. Always apply the noise PNG layer
4. Always pair with the transparent-blur header

---

## Z-index ladder

| Layer | Range |
|---|---|
| Base content | 0 |
| Sticky elements (mini-month, etc.) | 10–50 |
| Floating avatar | 90 |
| Modals / overlays | 200 |
| User panel sheet | 250 |
| Crisis-level UI (none yet) | 999+ |

Never use 9999. If you think you need 9999, the layer below is doing something wrong.

---

## Patterns NOT in the system yet (TODO post-trip)

- **Toast / notify system** — global `notify.toast()`, `.confirm()`, `.alert()`, `.prompt()`. Last toast wins. Bottom sheets on mobile. Currently using native `confirm()`/`alert()` as duct tape.
- **Sections grouping in guides** — schema ready, no UI.
- **Map preview affordance** — currently just a Google Maps URL link, no embedded map.
- **Loading skeleton** — currently using mono caption "Loading…". Skeleton placeholders not yet a system.
- **Empty states** — inconsistent across pages. Some have placeholder text, some show nothing. Should standardize.
- **Drag-to-reorder** — currently no surface uses it. When added, consolidate to one library.

---

## Design system audit + rebuild (parked, post-trip — major project)

**North star: Cargo's design philosophy.** Small palette + tight primitives = expressive themes on top. The flexibility comes from the system being constrained, not bloated.

### Why we need this

Current state of kit's CSS:
- Tokenized: radius (`--r-pill`, etc.), some colors (`--ink`, `--bg`, `--rule`, `--blue`)
- NOT tokenized: most font sizes (every component picks its own), most spacing, most padding patterns
- Many components are bespoke per-page rather than using shared primitives
- No size variants on buttons (no S/M/L)
- Pills, cards, inputs are reinvented inline rather than using primitive classes
- `--blue` does three jobs (hover state, active state, "yours" accent) — should be split

### What "done" looks like

- ~6-9 color tokens, semantic (`--bg`, `--surface`, `--ink`, `--ink-2`, `--rule`, `--accent`)
- ~6 type sizes, named (`--text-caption`, `--text-small`, `--text-body`, `--text-strong`, `--text-display`, `--text-hero`)
- ~8 spacing values, named (`--space-1` through `--space-8`)
- Button system: 3 sizes (S/M/L) × 3 variants (primary/secondary/ghost) + modifiers (danger, published)
- Pill primitives with variants (default, accent, solid, small)
- Card primitive (`.card`) — currently inlined per-page
- Input primitive (`.input`) — currently styled per-form
- Caption primitive (`.caption`) — for tiny mono uppercase labels everywhere
- Themes become token-only overrides, not component overrides
- 90% of kit's UI runs on the canonical primitives

### Phases (~12-20 hours total)

1. **Audit (~3-4 hr)** — inventory every color, size, padding, component. Output: a spreadsheet of all distinct values currently used.
2. **Token system (~2-3 hr)** — decide canonical sets. Color, type, spacing.
3. **Component rewrite (~6-8 hr)** — implement the new primitives in shell.css.
4. **Migration (~4-5 hr)** — sweep existing pages, swap bespoke styles for primitives. Risk of regressions; careful work.
5. **Theme architecture (~2-3 hr)** — themes are token-override files. Switch theme, whole UI reflows.

### Real flags

- **The audit is the hardest and most important step.** Skip it and the rebuild fails because tokens are designed for an imagined system, not the actual one.
- **Naming is bikeshedding-prone.** Lock names quickly, move on. `--ink` vs `--text` vs `--fg` are all defensible.
- **A `/dev/components/` page** showing every primitive in every variant is genuinely useful. ~30 min during the rebuild, hugely valuable for future-you remembering what exists.
- **The migration phase is where bugs hide.** Visual regressions sneak in. Worth doing one page at a time, with before/after screenshots.

### Reference

Cargo. Specifically: their template gallery. Look at how diverse the templates feel, then look at how few primitives they actually use. The flexibility is downstream of constraint.

### Naming conventions to lock

These are TBD — decide during Phase 2:

- Colors: `--ink` / `--text` / `--fg`?
- Surfaces: `--bg` / `--surface` / `--page`?
- Accent: `--accent` / `--blue` / `--brand`?
- Spacing: `--space-N` / `--s-N` / `--gap-N`?
- Type: `--text-N` / `--type-N` / `--font-N`?

Whatever's chosen, lock it. Consistency beats correctness for these.

---

## Themes (parked, post-trip expansion)

Two distinct theme systems exist (or are planned). They share the `body.theme-{name}` mechanism but should remain architecturally separate because they serve different purposes.

### Internal kit interface themes

**Purpose:** member-side customization / A-B testing of the tool's aesthetic.
**Scope:** affects logged-in views. Stream pills, capture overlay, possibly typography/density.
**Storage:** `localStorage.kit.streamTheme`, plus `?theme=` query param override.
**Files:** `public/css/themes/{name}.css` (e.g. `pills.css`, `pills2.css`).
**Activation:** `body.theme-{name}` class set by `shell.js` bootstrap.
**Status:** infrastructure exists, currently 2 themes (peach pills, wild pills2 with 7 treatments).

When expanding: name themes after real-world artifacts/registers (Magazine, Receipt, Field, Telegram), not abstract numbers. Themes should come from specific aesthetic references, ideally things you've actually held.

### Guide themes (editorial, public-facing)

**Purpose:** let each published guide feel like its own artifact. Reader-facing differentiation.
**Scope:** affects only public `/g/:slug` view. Doesn't change kit's internal UI.
**Storage:** `guides.theme` column (plan: `ALTER TABLE guides ADD COLUMN theme TEXT NOT NULL DEFAULT 'default'`).
**Files:** `public/css/g-themes/{name}.css` (separate folder from interface themes).
**Activation:** `body.theme-{theme}` class on `/g/:slug` rendered from API value.
**Status:** not built. Planned: 3 themes to start, picker in editor settings panel.

When building: themes override `.g-public__*` selectors only. Kit's primitives (`.btn`, `.head`, etc.) are not theme-aware — they're foundation, not surface. A guide theme is a coat of paint on the public-page output, nothing more.

### Why two systems, not one

Reader experience and member experience have different needs. A magazine-loving guide reader doesn't care what the editor's tool looks like. A member tweaking their stream pills doesn't want their published guides to all suddenly look like Magazine theme.

Keep the systems separate. Different folders. Different storage. Different decisions.

### Guide templates (presentation form, distinct from theme)

Themes = visual register (colors, type, register). Templates = structural form (what data is used, what layout). They compose: a guide has both a template AND a theme.

**Storage:** `guides.template` column (`'quick' | 'editorial' | 'atlas' | 'print'`, default `'editorial'`).

**Editor:** template picker at publish time. Live preview. Switching templates doesn't lose data — same spots, different presentation.

**Files:** `public/css/g-templates/{name}.css`. `g.html` reads `guide.template` and applies appropriate class.

**Templates planned:**

- **Quick** — text-only, phone-first. Place name + 1-line tip per spot. No photos, no map, no chrome. For "send me your Lisbon picks" sharing. Most shareable, lightest, fastest to publish. Future: A6 print parallel.

- **Editorial** (default) — narrative + custom photos. Long-form intro field, photos interspersed, magazine typography, section dividers. For Sunday-morning-reading guides. Requires photo upload system (gatekeeper).

- **Atlas** — guide + photos + map. Two-column (content left, sticky map right), numbered Advanced Markers, scroll-sync between list and pins. Place addresses + phones rendered when `place_id` is set. For "actually using to plan a trip" guides. Manual place_id entry from admin (kit's curation is editorial, not crowdsourced).

- **Print** (future) — A6 booklet PDF. Server-side generation (puppeteer or similar). Print-specific CSS, booklet pagination, downloadable as a Summer Holiday physical artifact. Same data as Quick or Editorial, different output medium.

**Why this matters:** kit's guides become a real publishing system, not a single layout. The same Bali coffee guide can exist as a Quick share-link AND a printable A6 booklet AND a magazine-format Atlas guide. Different artifacts from one curated source. This is what makes Summer Holiday guides a real publication, not a website page.

**Sequencing (post-trip):**
1. Quick template first (lightest, no photo dependency, ~3-4 hr)
2. Atlas template second (manual place_ids, map integration, ~6-8 hr)
3. Photo upload system as separate project (whenever ready)
4. Editorial template after photos exist (~4-6 hr)
5. Print template later (~4-6 hr)

**Real flag on place_ids:** Atlas template needs Google Place IDs for map pins, addresses, phones. Manual entry from admin is the path — not auto-geocoding. Editorial publication, not crowdsourced. Cost is essentially zero (one Place Details lookup per spot, ~$0.017, paid once at the moment you decide to add a place_id, not on every render).

---

## Decisions logged

These are real decisions made during builds. Don't relitigate without reason.

- **No build tooling.** Pure HTML/CSS/JS. No bundler, no transpiler, no React.
- **EJS deferred.** Static HTML files only.
- **Default-to-dark theme is on `<html>` not `<body>`.** Bootstrapped by inline script in `<head>`.
- **No emojis in UI** unless explicitly content (e.g., flags in a country-pick UI). Ink + blue only.
- **Mono only for true data.** Timestamps, codes, IDs, captions. Never for body copy.
- **Single hairlines only.** No double borders, no thick rules.
- **Avatar is bottom-right on mobile.** Permanent — anything new on mobile cannot also live bottom-right.
- **Public surfaces strip identifying data.** No user_id, no email, no household. Just author display name + content.
- **Trips are private artifacts.** Schema supports public sharing via `status`+`slug`+`/t/:slug`+API endpoint, but UI to publish was pulled — sensitive operational data (booking codes, addresses) makes them unsafe to publish.

---

## Architectural roadmap (parked, post-trip)

Major structural moves to make in sequence. Each shippable independently. Each builds on the previous.

### Phase 1 — Centralized nav config (~2 hr)

**Problem:** Nav markup is duplicated across every HTML file. Adds inconsistencies (recently: phrases page lost Guides link). Editing nav requires touching ~10+ files.

**Solution:** JSON-driven nav. Single source of truth in `public/data/nav.json` (or split into `nav.json` + `nav-mobile.json` if structure differs). `public/js/nav.js` reads JSON, renders into pages with `data-nav="primary"` and `data-nav="drawer"` attributes.

```json
{
  "primary":           [{ "label": "Home", "href": "/" }, ...],
  "drawer":            [...full menu...],
  "drawer_signed_out": [{ "label": "Sign in", "href": "/login.html" }]
}
```

Pages embed empty `<header data-nav="primary">` and `<div data-nav="drawer">`. JS renders. Active state determined by current URL match.

### Phase 2 — Public URL pattern change (~3-4 hr)

**Current:** `/g/:slug`. Too short, too cryptic, doesn't dignify the artifact.

**Target:** `/guide/:slug`. Editorial, readable, says what it is.

Reference: Telescope uses `/collection/{slug-with-hash}`. We adopt singular `/guide/`.

Server adds alias: old `/g/:slug` 301-redirects to `/guide/:slug` for any URLs already shared.

Future: when handles exist, migrate to `/guide/{handle}/{slug}`. For now (single user) `/guide/{slug}` is fine.

Same pattern for future public artifacts:
- `/guide/:slug`
- `/profile/:handle` (eventually)
- `/trip/:slug` (eventually, with proper privacy controls — currently dormant)

### Phase 3 — Apps area (playful side-things) (~3-4 hr)

**Concept:** kit's core is the travel companion (Travel / Spots / Guides — all top-level). Apps is a separate area for playful, experimental, or one-off side-things. Some are utilities, some are games, some are weird two-person experiments.

**Naming locked:** "Apps." Honest — these ARE little apps. Not pretending they're more.

**URL structure:** `/apps/{name}/`.

**Top-level structure stays:**
- `/` — home
- `/travel/` — travel hub
- `/spots/` — saves library
- `/guides/` — your guides (with `/guide/:slug` for public)
- `/apps/` — index of apps
  - `/apps/juice/` — phrases (renamed from `/phrases/`)
  - `/apps/snake/` — the snake game (renamed from `/idle/`)
  - `/apps/dual/` — Peter's two-person back-and-forth (future)
  - other future apps

**Initial migrations:**
- `/phrases/` → `/apps/juice/`
- `/idle/` → `/apps/snake/`

**Why not "rooms" or "experiments":**
- "Rooms" overreaches — implies more depth than these things have
- "Experiments" implies temporary, devalues things like Snake that should just exist
- "Apps" is exactly what they are: little applications inside kit

**Apps page (`/apps/`):** lightweight grid of cards or pills, one per app. Each links to its app. Members visit Apps when they want to play, escape, or experiment. It's the "fun corner" of kit.

**Real flag:** apps have their own visual identity inside kit's shell. Juice has the gradient. Snake has its retro green. Dual will have its own thing. Each app shares kit's nav/header/auth but the content area is the app's playground. This is the right division.

### Phase 4 — Design system rebuild + module-based homepage (~12-20 hr)

See "Design system audit + rebuild" section above. The headline: 12-col grid, named modules, ~6 colors / ~6 type sizes / ~8 spacing values, themes as token-overrides.

**12-col grid scope decision:** the grid is opt-in via `.page-grid` class, NOT a global default. Pages declare they use it; pages that don't want it ignore it.

Pages that GET 12-col grid:
- **Home** — primary use case. Modules of varying spans. Flexibility is the point.
- **Atlas template for public guides** — content + map two-column. Grid-shaped naturally.
- **Apps index** — light use. Allows feature cards (span 12) mixed with standard cards (span 6).

Pages that DON'T get 12-col grid (single-column lists or forms; grid would be overhead):
- Spots, Travel hub, Phrases — flex column is right
- Capture overlay, modals — forms want predictable flow
- Settings — sections of full-width text

Module-based homepage specifically:
- Home becomes a grid of self-contained modules
- Modules: `<DayModule>`, `<TripStripModule>`, `<StreamModule>`, `<MiniMonthModule>`, `<JuiceModule>`, `<CaptureModule>`, etc.
- Each is a discrete HTML block + scoped CSS prefix + init JS function
- Hydration: pages find `[data-module]` elements and call the appropriate init function
- 12-col grid lets modules span thirds (4)/halves (6)/two-thirds (8)/full (12)
- Mobile collapses to single column (span ignored)

Todos parked from homepage as part of this — code preserved in `/dev/parked/` (or similar), can be re-introduced as a module later.

Eventually: configurable home, where members pick which modules to show and in what order. V1 is fixed.

**Real flag:** the home rebuild is medium-sized work (~6-10 hr standalone). Should NOT be done before token system lands, or you'll refactor home twice. Sequence: tokens → primitives → migrate home to use both → THEN rebuild home as modules. That's why this work is grouped under Phase 4 design system rebuild rather than a standalone project.

### Phase 5 — New apps

Once foundation is solid, add new apps to `/apps/`.

- **Dual** — two-person back-and-forth thing with Peter (experimental, may graduate to dualapp.com)
- Whatever surfaces during real use

The point: kit's `/apps/` becomes a place where personal/playful software gets prototyped and lives. Some becomes Summer Holiday products. Some stays personal. All members share the underlying shell.

---

## Files of record

| File | Role |
|---|---|
| `public/css/shell.css` | Tokens, primitives (`.btn`, `.btn-close-circle`, `.head`, `.user-panel`) |
| `public/css/home.css` | Home-specific layout + `.itin-fs__*` overlay styles (also reused by public guide page) |
| `public/css/phrases.css` | Phrases page (gradient, pills, dropdowns) |
| `public/css/guides.css` | Guides editor + public guide page |
| `public/css/spots.css` | Spots index + filters |
| `public/css/travel.css` | Travel hub |
| `public/css/themes/pills.css`, `pills2.css` | Optional theme variants for stream pills |
| `public/img/noise.png` | Film grain tile (128×128, ~20kb) |
| `docs/STYLE_GUIDE.md` | This file |
