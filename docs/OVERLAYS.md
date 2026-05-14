# kit — overlays reference

Every modal, full-screen sheet, popover, and drawer in kit. Includes DOM anchor, CSS file, JS init, and contract notes. This is the doc to read before doing any overlay work — bug fixes, restyling, print stylesheets, accessibility passes.

**Why this doc exists:** overlay class names live across multiple files (HTML markup, page-specific CSS, sometimes JS-injected). When a fresh Claude or future-you needs to target "the trip itinerary overlay" for a print stylesheet or a behavior change, this is the lookup.

**Last verified:** May 11, 2026.

---

## Quick map

| Overlay | DOM anchor | CSS file | JS file | Trigger |
|---|---|---|---|---|
| Trip itinerary | `.modal.itin-fs.is-open` | `home.css` (`.itin-fs__*`) | `trip.js`, `t.html` inline | Tap a trip card |
| Capture (new spot) | `.capture-fs.is-open` | `home.css` (`.capture-fs__*`) | `capture-overlay.js`, `capture.js` | Capture button, `+` |
| Spot edit | `.modal.spot-fs.is-open` | `home.css` (`.spot-fs__*`) | `spots.js`, `home.js` | Tap a saved spot |
| Year picker | `.year-overlay.is-open` | `home.css` (`.year-overlay__*`) | `home.js` | Year link in stream |
| User panel | `.user-panel.is-open` | `shell.css` (`.user-panel__*`) | `shell.js` | Avatar tap |
| Time popover | `.time-popover.is-open` | `shell.css` (`.time-popover__*`) | `time.js` | Header time click (desktop only) |
| Menu drawer (mobile) | `.menu-overlay.is-open` | `shell.css` (`.menu-overlay`) | `nav.js`, `shell.js` | Hamburger tap |
| City popover (in capture) | `.capture-fs__city-popover.is-open` | `home.css` | `capture-overlay.js` | "In [city]" button inside capture |

---

## Overlay action contract (canonical)

Defined in STYLE_GUIDE.md. Repeated here because every overlay must respect it:

| Position | Element |
|---|---|
| Top-LEFT | `.btn-close-circle` (32×32 outlined circle, × glyph) |
| Bottom-RIGHT | `.btn` primary action (Save, Publish) |
| Bottom-RIGHT, LEFT of primary | `.btn--secondary` if two actions |
| Bottom-LEFT | Status indicator, helper text |

**Never put close on the right** — it collides with `.floating-avatar` on mobile (fixed bottom-right) and breaks established muscle memory.

---

## Trip itinerary overlay

**DOM:** `<div class="modal itin-fs is-open">…</div>` — direct child of `<body>`, appended on open.

**CSS:** `public/css/home.css`, lines ~920–1150. Classes use the `.itin-fs__*` BEM-ish convention. Note that home.css carries these styles even though the overlay is used outside home — this is intentional and called out in `t.html`'s comment ("Editing `.itin-fs__*` in home.css automatically updates both surfaces").

**Used by two surfaces:**
- The full-screen overlay on home, opened when tapping a trip card (DOM markup injected by `home.js`)
- The static page at `t.html` (used for trip preview/print via a direct URL), which reuses the same `.itin-fs__*` classes without the `.modal` modal-display behavior

**Markup shape (when injected):**
```html
<div class="modal itin-fs is-open">
  <button class="btn-close-circle" aria-label="Close">×</button>
  <div class="itin-fs__inner">
    <header class="itin-fs__head">
      <h1 class="itin-fs__title">Europe 26</h1>
      <p class="itin-fs__dates">May 12 — Jun 24 · 2026</p>
    </header>
    <div class="itin-fs__meta">…</div>
    <div class="itin-fs__trip-notes">…</div>
    <div class="itin-fs__segments">
      <!-- per-city sections (Paris, Marseille, …) -->
    </div>
  </div>
</div>
```

**Sub-classes worth knowing:**
- `.itin-fs__head` — title + dates block
- `.itin-fs__title` — page title (Europe 26)
- `.itin-fs__dates` — date range subline
- `.itin-fs__meta` — itinerary meta (route summary)
- `.itin-fs__trip-notes` — markdown notes attached to trip
- `.itin-fs__segments` — container for city sections
- `.itin-fs__seg-notes` — per-segment notes

**Notes for any work here:**
- The overlay is `position: fixed; inset: 0;` with internal scroll. Print stylesheets must flatten this — see the May 11 print-CSS console patch (parked for permanent stylesheet post-trip).
- `.is-open` is the visibility toggle. `display: flex` when on, `display: none` when off.
- The close button is `.btn-close-circle` (32×32), positioned top-LEFT inside the overlay padding.

---

## Capture overlay

**DOM:** `<div class="capture-fs is-open" id="capture-fs">…</div>` — direct child of `<body>`, present in `index.html` and injected/used by other pages.

**CSS:** `public/css/home.css`, lines ~323–700+ (`.capture-fs__*`).

**JS:** `public/js/capture-overlay.js` (the overlay shell + bind-city behavior), `public/js/capture.js` (form submit + API call).

**Triggered by:** Any "+" / capture button across kit. Most common: home page capture launcher.

**Markup shape:**
```html
<div class="capture-fs is-open">
  <div class="capture-fs__inner">
    <header class="capture-fs__head">
      <button class="btn-close-circle">×</button>
    </header>
    <div class="capture-fs__bind">
      <div class="capture-fs__bind-row">
        <span class="capture-fs__bind-label">In</span>
        <button class="capture-fs__city-btn">
          <span>Bali</span>
          <span class="capture-fs__city-caret">▾</span>
        </button>
      </div>
      <div class="capture-fs__city-popover">
        <input class="capture-fs__city-search" placeholder="Search…">
        <div class="capture-fs__city-list">…</div>
      </div>
      <button class="capture-fs__been-btn" data-been="true">Been</button>
    </div>
    <div class="capture-fs__body">
      <textarea class="capture-fs__textarea" placeholder="Della Terra Bali, sit at the bar…"></textarea>
    </div>
    <footer class="capture-fs__foot">…</footer>
  </div>
</div>
```

**Sub-overlay:** `.capture-fs__city-popover.is-open` — pops up when "In [city]" button is tapped. Lets user bind the capture to a city (passed to AI parser as context — see SCHEMA.md / parse-capture.js).

**Been toggle:** `.capture-fs__been-btn[data-been="true|false"]` — `true` (default) for places-visited, `false` for want-to-go. Sets `spots.been` boolean.

**Reuse:** The phrasebook also uses `.capture-fs__*` classes for its capture surface — see `public/phrases/capture/index.html`. Editing these classes in home.css updates both.

---

## Save edit overlay

**DOM:** `<div class="modal spot-fs is-open">…</div>` — direct child of `<body>`.

**CSS:** `public/css/home.css`, lines ~1156+ (`.spot-fs__*`).

**JS:** `public/js/spots.js`, `public/js/home.js`.

**Triggered by:** Tapping a saved spot from spots index, home stream, or anywhere a spot is listed.

**Markup shape:**
```html
<div class="modal spot-fs is-open">
  <header class="spot-fs__head">
    <h1 class="spot-fs__title">Della Terra</h1>
  </header>
  <div class="spot-fs__inner">
    <div class="spot-fs__field">
      <label class="spot-fs__label">Tip</label>
      <textarea class="textarea">…</textarea>
    </div>
    <!-- more fields -->
  </div>
</div>
```

**Sub-classes:**
- `.spot-fs__head` — title block
- `.spot-fs__title` — spot name (editable)
- `.spot-fs__inner` — body container
- `.spot-fs__field` — single edit field wrapper
- `.spot-fs__label` — uppercase tiny mono label (same pattern as `.field__label`)

**Reuse note:** Mentioned in `public/css/spots.css` header comment that spots reuses `.spot-fs*` classes from home.css. Don't move these to spots.css without checking all consumers.

---

## Year overlay

**DOM:** `<div class="year-overlay is-open">…</div>`

**CSS:** `public/css/home.css`, lines ~1333+ (`.year-overlay__*`).

**JS:** `public/js/home.js`.

**Triggered by:** Year affordance in home stream / archive views.

**Sub-classes:**
- `.year-overlay__inner` — content container
- `.year-overlay__head` — title row
- `.year-overlay__title` — title text
- `.year-overlay__close` — text-style close (NOT `.btn-close-circle`)
- `.year-overlay__grid` — month grid (4 columns desktop, 3 on tablet, 2 on mobile)

**Flag:** Uses a text-style close rather than the canonical `.btn-close-circle`. This is an inconsistency — when this overlay is next touched, migrate it to the standard pattern. (Don't do it as a drive-by.)

---

## User panel

**DOM:** `<div class="user-panel" hidden>…</div>` — present in every page's footer markup. `[hidden]` while closed; `.is-open` when displayed.

**CSS:** `public/css/shell.css`, lines ~1198–1366.

**JS:** `public/js/shell.js`.

**Triggered by:**
- Mobile: `.floating-avatar` (fixed bottom-right, 48×48)
- Desktop: `.slim-avatar` (in header right, 32×32)

**Surface:**
- Desktop: popover anchored top-right under the avatar (280px wide, card)
- Mobile: bottom sheet (slides up, max 70vh, drag handle at top)

**Markup shape:**
```html
<div class="user-panel" hidden>
  <div class="user-panel__scrim"></div>
  <div class="user-panel__sheet">
    <div class="user-panel__handle"></div>  <!-- mobile only -->
    <div class="user-panel__head">
      <div class="user-panel__avatar">M</div>
      <div class="user-panel__name">Michael</div>
    </div>
    <nav class="user-panel__nav">
      <a class="user-panel__link" href="/settings.html">Settings</a>
      <a class="user-panel__link" href="/admin/">Admin</a>
      <button class="user-panel__signout">Sign out</button>
    </nav>
    <div class="user-panel__foot">
      <span class="user-panel__ver">v1.0</span>
    </div>
  </div>
</div>
```

**Contract:** Account-level affordances only (settings, admin, sign-out, profile info). NOT navigation. Navigation lives in nav.json + `.nav` / `.menu-overlay`. See STYLE_GUIDE.md "Navigation vs user panel" section.

---

## Time popover

**DOM:** `<div class="time-popover" hidden>…</div>` — `.is-open` when displayed.

**CSS:** `public/css/shell.css`, lines ~988–1115.

**JS:** `public/js/time.js`.

**Triggered by:** `.time-trigger` button in header (desktop only).

**Behavior:**
- Desktop: popover anchored top-right under time
- Mobile: hidden entirely (mobile users navigate to `/clocks/` via the menu)

**Sub-classes:**
- `.time-popover__sheet` — content card
- `.time-popover__list` — list of tracked cities
- `.time-popover__row` — single city row (LHS: city + offset; RHS: current time)
- `.time-popover__open` — "Open clocks" link at footer

**Data source:** `users.tracked_cities` JSONB column (see SCHEMA.md). Empty state shows a CTA to add tracked cities.

---

## Menu drawer (mobile)

**DOM:** `<div class="menu-overlay">…</div>` — `.is-open` to display.

**CSS:** `public/css/shell.css`, lines ~306–387.

**JS:** `public/js/nav.js`, `public/js/shell.js`.

**Triggered by:** `.menu-btn` (hamburger) in header on `<=760px`.

**Behavior:** Full-screen overlay with nav links rendered at hero-size type (36px). The `.menu-btn` bars animate to an X when `.is-open`.

**Sub-classes:**
- `.menu-overlay__inner` — padding container
- `.menu-shortcuts` — optional tappable tiles at the top (capture, saves count, etc.)
- `.menu-shortcut` — single tile (label + count + arrow)
- `.menu-overlay__signout` — sign-out link (subdued)

**Source of truth for items:** `public/data/nav.json` → `drawer` section. Rendered by `nav.js` at page load.

---

## Capture city popover

**DOM:** `<div class="capture-fs__city-popover is-open">` — nested inside capture overlay.

**CSS:** `public/css/home.css`, lines ~418–467.

**JS:** `public/js/capture-overlay.js`.

**Behavior:** Appears when "In [city]" button is tapped inside the capture overlay. Lets user bind the capture to a specific city before parsing.

**Sub-classes:**
- `.capture-fs__city-search` — search input
- `.capture-fs__city-list` — scrollable list of cities
- `.capture-fs__city-item` — single city row
- `.capture-fs__city-item.is-current` — currently bound city (accent color)
- `.capture-fs__city-item__country` — country suffix on each row

---

## Patterns NOT to confuse

### Two kinds of inline-remove (same shape, different intent)

Both are 28×28 circles. Different hover behavior. Different ownership semantics.

- **Always-visible danger remove** — `.btn-remove-circle` primitive. `--ink-3` → `--danger` on hover. Use in list rows where the remove is a known affordance.
- **Hover-reveal subtle remove** — bespoke class per context (e.g., `.time-card__remove` in travel.css, `.ph-pill__delete` in phrases.css). Opacity `0` → `1` on row hover, color goes to `--ink` not `--danger`.

These look identical when both fully visible. They are not interchangeable — they communicate different things.

### `.modal` vs `.*-fs`

- `.modal` is the generic full-screen overlay class in shell.css. Provides positioning, display toggling, head/body/foot structure.
- `.modal.*-fs` (`itin-fs`, `spot-fs`) are specific overlays that use `.modal` as base and add their own styling.
- `.capture-fs` is **standalone** — it does NOT extend `.modal`. It has its own full-screen positioning.
- `.year-overlay`, `.user-panel`, `.time-popover` are all standalone overlay roots too.

When adding a new overlay, use `.modal` as base unless there's reason not to. Capture is the exception because its styling diverged early.

---

## Adding a new overlay — checklist

1. Decide if it extends `.modal` (most cases yes) or is standalone (capture-like)
2. Pick a class prefix (`.thing-fs__*` for full-screen, `.thing-popover__*` for popover)
3. Top-LEFT close = `.btn-close-circle`. Bottom-right action = `.btn`. No exceptions without a real reason.
4. Add to this doc.
5. If the overlay belongs to a specific page, put its CSS in that page's file. If reused across pages, put it in `shell.css`.

---

End of overlays reference.
